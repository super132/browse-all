import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { chromium } from 'playwright';
import { BrowserToolError } from '../errors';
import { SessionManager } from '../session/SessionManager';
import type { CommandRequest, CommandResponse, ErrorResponse } from '../types';
import { dispatch } from '../commands/index';

const BASE_DIR = '/tmp/browser-tool';
export const SOCK_PATH = path.join(BASE_DIR, 'daemon.sock');
export const PID_PATH = path.join(BASE_DIR, 'daemon.pid');

// ---------------------------------------------------------------------------
// Structured stderr logger — stdout is reserved for CLI JSON output
// ---------------------------------------------------------------------------

export function log(
  level: 'INFO' | 'ERROR',
  message: string,
  extra?: Record<string, unknown>,
): void {
  const entry: Record<string, unknown> = { level, time: new Date().toISOString(), message };
  if (extra) Object.assign(entry, extra);
  process.stderr.write(JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------------------
// Error serialisation
// ---------------------------------------------------------------------------

export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof BrowserToolError) {
    return { error: err.message, code: err.code };
  }
  return { error: err instanceof Error ? err.message : String(err), code: 'INVALID_ARGUMENTS' };
}

// ---------------------------------------------------------------------------
// Stale-socket detection: remove if present but not connectable
// ---------------------------------------------------------------------------

async function removeStaleSocket(sockPath: string): Promise<void> {
  try {
    await fs.promises.access(sockPath);
  } catch {
    return; // Socket file does not exist
  }

  // File exists — probe it
  await new Promise<void>(resolve => {
    const probe = net.createConnection(sockPath);
    probe.once('connect', () => {
      probe.destroy();
      log('ERROR', 'Another daemon instance is already running');
      process.exit(1);
    });
    probe.once('error', () => {
      probe.destroy();
      resolve(); // Stale — safe to overwrite
    });
  });

  await fs.promises.unlink(sockPath).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Per-connection request handler
// ---------------------------------------------------------------------------

export async function handleLine(
  line: string,
  socket: net.Socket,
  manager: SessionManager,
): Promise<void> {
  let response: CommandResponse;

  try {
    let request: CommandRequest;
    try {
      request = JSON.parse(line) as CommandRequest;
    } catch {
      writeResponse(socket, { error: 'Malformed JSON', code: 'INVALID_ARGUMENTS' });
      return;
    }

    const { command, sessionId, args = {} } = request;
    if (typeof command !== 'string' || command === '') {
      writeResponse(socket, { error: 'Missing or empty command field', code: 'INVALID_ARGUMENTS' });
      return;
    }

    response = await dispatch(command, sessionId, args, manager);
  } catch (err) {
    response = toErrorResponse(err);
  }

  writeResponse(socket, response);
}

function writeResponse(socket: net.Socket, response: CommandResponse): void {
  try {
    socket.write(JSON.stringify(response) + '\n');
  } catch {
    // Client disconnected before we could reply
  }
}

// ---------------------------------------------------------------------------
// Server factory — exported so tests can spin up isolated instances
// ---------------------------------------------------------------------------

export async function startServer(
  manager: SessionManager,
  sockPath: string = SOCK_PATH,
): Promise<net.Server> {
  const server = net.createServer(socket => {
    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line !== '') void handleLine(line, socket, manager);
      }
    });

    socket.on('error', err => {
      log('ERROR', 'Socket error', { error: err.message });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(sockPath, resolve);
  });

  return server;
}

// ---------------------------------------------------------------------------
// Daemon entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await fs.promises.mkdir(BASE_DIR, { recursive: true });
  await SessionManager.cleanupStaleTempDirs();
  await removeStaleSocket(SOCK_PATH);

  log('INFO', 'Launching browser');
  const browser = await chromium.launch({ headless: true });
  const manager = new SessionManager(browser);

  const server = await startServer(manager, SOCK_PATH);
  await fs.promises.writeFile(PID_PATH, String(process.pid), 'utf8');
  log('INFO', 'Daemon started', { pid: process.pid, sock: SOCK_PATH });

  const shutdown = async (): Promise<void> => {
    log('INFO', 'Shutting down');
    server.close();
    await manager.shutdown();
    await Promise.allSettled([
      fs.promises.unlink(SOCK_PATH),
      fs.promises.unlink(PID_PATH),
    ]);
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

if (require.main === module) {
  main().catch(err => {
    log('ERROR', 'Fatal startup error', { error: String(err) });
    process.exit(1);
  });
}
