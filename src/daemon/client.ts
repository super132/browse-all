import * as net from 'net';
import * as path from 'path';
import * as childProcess from 'child_process';
import { BrowserToolError } from '../errors';
import type { CommandRequest, CommandResponse } from '../types';

const SOCK_PATH = '/tmp/browser-tool/daemon.sock';
const RESPONSE_TIMEOUT_MS = 10_000;
// Delays between connection retries after spawning the daemon:
// 100 ms, 200 ms, 400 ms, 800 ms, 1 600 ms
const BACKOFF_MS = [100, 200, 400, 800, 1_600];

export interface SendCommandOptions {
  sockPath?: string;
  timeoutMs?: number;
  backoffMs?: number[];
  /** Override the daemon-spawn function. Used in tests to avoid real process spawning. */
  _spawnDaemon?: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function spawnDaemon(): void {
  const serverPath = path.join(__dirname, 'server.js');
  const child = childProcess.spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function connectOnce(sockPath: string): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection(sockPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', err => { socket.destroy(); reject(err); });
  });
}

async function connectWithAutoStart(
  sockPath: string,
  backoffMs: number[],
  onFirstRetry: () => void,
): Promise<net.Socket> {
  let daemonSpawned = false;

  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      return await connectOnce(sockPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const retriable = code === 'ENOENT' || code === 'ECONNREFUSED';

      if (!retriable || attempt === backoffMs.length) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BrowserToolError('INVALID_ARGUMENTS', `Cannot connect to daemon: ${msg}`);
      }

      if (!daemonSpawned) {
        onFirstRetry();
        daemonSpawned = true;
      }

      await sleep(backoffMs[attempt]);
    }
  }

  // Unreachable — loop always throws or returns
  throw new BrowserToolError('INVALID_ARGUMENTS', 'Cannot connect to daemon');
}

export async function sendCommand(
  command: string,
  args: Record<string, unknown>,
  sessionId?: string,
  opts: SendCommandOptions = {},
): Promise<CommandResponse> {
  const {
    sockPath = SOCK_PATH,
    timeoutMs = RESPONSE_TIMEOUT_MS,
    backoffMs = BACKOFF_MS,
    _spawnDaemon: spawnFn = spawnDaemon,
  } = opts;

  const socket = await connectWithAutoStart(sockPath, backoffMs, spawnFn);

  return new Promise<CommandResponse>((resolve, reject) => {
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      socket.destroy();
      reject(new BrowserToolError('INVALID_ARGUMENTS', 'Daemon did not respond within 10 seconds'));
    }, timeoutMs);

    const done = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        done(() => {
          try {
            resolve(JSON.parse(line) as CommandResponse);
          } catch {
            reject(
              new BrowserToolError(
                'INVALID_ARGUMENTS',
                `Daemon returned invalid JSON: ${line.slice(0, 200)}`,
              ),
            );
          }
        });
      }
    });

    socket.on('error', err => {
      done(() =>
        reject(
          new BrowserToolError(
            'INVALID_ARGUMENTS',
            `Socket error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        ),
      );
    });

    socket.on('close', () => {
      // Fallback: server closed the connection before sending a newline-terminated response
      done(() => {
        const trimmed = buffer.trim();
        if (trimmed !== '') {
          try {
            resolve(JSON.parse(trimmed) as CommandResponse);
          } catch {
            reject(new BrowserToolError('INVALID_ARGUMENTS', 'Daemon returned invalid JSON on close'));
          }
        } else {
          reject(new BrowserToolError('INVALID_ARGUMENTS', 'Daemon closed connection without responding'));
        }
      });
    });

    const request: CommandRequest = { command, sessionId, args };
    socket.write(JSON.stringify(request) + '\n');
  });
}
