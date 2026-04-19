import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { SessionManager } from '../../session/SessionManager';
import type { BrowserSession } from '../../session/BrowserSession';
import { startServer, handleLine, toErrorResponse } from '../../daemon/server';
import { BrowserToolError } from '../../errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpSock(): string {
  return path.join(os.tmpdir(), `bt-test-${process.pid}-${Date.now()}.sock`);
}

function makeSession(): BrowserSession {
  return {
    id: 'sess-1',
    navigate: jest.fn().mockResolvedValue({ sessionId: 'sess-1', url: 'https://x.com', title: 'X' }),
    read: jest.fn().mockResolvedValue({ sessionId: 'sess-1', markdown: '# X', url: '', title: '', screenshotPath: '', interactiveElements: [] }),
    click: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'click', target: '#btn' }),
  } as unknown as BrowserSession;
}

function makeManager(session?: BrowserSession): SessionManager {
  const s = session ?? makeSession();
  return {
    createSession: jest.fn().mockResolvedValue({ ...s, id: 'new-sess' }),
    getSession: jest.fn().mockReturnValue(s),
    destroySession: jest.fn().mockResolvedValue(undefined),
  } as unknown as SessionManager;
}

/** Send a raw string to a unix socket and resolve with the first newline-terminated response. */
function socketRoundTrip(sockPath: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath);
    let buf = '';
    client.on('data', chunk => {
      buf += chunk.toString();
      const idx = buf.indexOf('\n');
      if (idx !== -1) {
        client.destroy();
        resolve(buf.slice(0, idx));
      }
    });
    client.on('error', reject);
    client.once('connect', () => client.write(payload));
  });
}

// ---------------------------------------------------------------------------
// toErrorResponse
// ---------------------------------------------------------------------------

describe('toErrorResponse', () => {
  it('maps BrowserToolError to its code and message', () => {
    const err = new BrowserToolError('TIMEOUT', 'too slow');
    expect(toErrorResponse(err)).toEqual({ error: 'too slow', code: 'TIMEOUT' });
  });

  it('maps generic Error to INVALID_ARGUMENTS', () => {
    expect(toErrorResponse(new Error('boom'))).toEqual({ error: 'boom', code: 'INVALID_ARGUMENTS' });
  });

  it('maps non-Error thrown values to INVALID_ARGUMENTS', () => {
    expect(toErrorResponse('oops')).toEqual({ error: 'oops', code: 'INVALID_ARGUMENTS' });
  });
});

// ---------------------------------------------------------------------------
// handleLine (unit-level, without a real socket)
// ---------------------------------------------------------------------------

describe('handleLine', () => {
  function makeFakeSocket(): net.Socket {
    return { write: jest.fn() } as unknown as net.Socket;
  }

  it('returns INVALID_ARGUMENTS for malformed JSON', async () => {
    const socket = makeFakeSocket();
    await handleLine('not json }{', socket, makeManager());
    const written = (socket.write as jest.Mock).mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed.code).toBe('INVALID_ARGUMENTS');
  });

  it('returns INVALID_ARGUMENTS for missing command field', async () => {
    const socket = makeFakeSocket();
    await handleLine(JSON.stringify({ sessionId: 's', args: {} }), socket, makeManager());
    const parsed = JSON.parse((socket.write as jest.Mock).mock.calls[0][0] as string);
    expect(parsed.code).toBe('INVALID_ARGUMENTS');
  });

  it('returns INVALID_ARGUMENTS for unknown command', async () => {
    const socket = makeFakeSocket();
    await handleLine(JSON.stringify({ command: 'explode', args: {} }), socket, makeManager());
    const parsed = JSON.parse((socket.write as jest.Mock).mock.calls[0][0] as string);
    expect(parsed.code).toBe('INVALID_ARGUMENTS');
  });

  it('dispatches start and writes StartResponse', async () => {
    const socket = makeFakeSocket();
    await handleLine(JSON.stringify({ command: 'start', args: {} }), socket, makeManager());
    const parsed = JSON.parse((socket.write as jest.Mock).mock.calls[0][0] as string);
    expect(parsed.message).toBe('Session started');
  });

  it('dispatches navigate and writes NavigateResponse', async () => {
    const socket = makeFakeSocket();
    const manager = makeManager();
    await handleLine(
      JSON.stringify({ command: 'navigate', sessionId: 'sess-1', args: { url: 'https://x.com' } }),
      socket,
      manager,
    );
    const parsed = JSON.parse((socket.write as jest.Mock).mock.calls[0][0] as string);
    expect(parsed.url).toBe('https://x.com');
  });

  it('does not throw when socket.write fails (client disconnected)', async () => {
    const socket = { write: jest.fn().mockImplementation(() => { throw new Error('closed'); }) } as unknown as net.Socket;
    await expect(
      handleLine(JSON.stringify({ command: 'start', args: {} }), socket, makeManager()),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// startServer (integration-level over a real unix socket)
// ---------------------------------------------------------------------------

describe('startServer', () => {
  let sockPath: string;
  let server: net.Server;

  beforeEach(async () => {
    sockPath = tmpSock();
    server = await startServer(makeManager(), sockPath);
  });

  afterEach(done => {
    server.close(() => {
      fs.unlink(sockPath, () => done());
    });
  });

  it('returns INVALID_ARGUMENTS for malformed JSON over the socket', async () => {
    const raw = await socketRoundTrip(sockPath, 'bad json\n');
    expect(JSON.parse(raw).code).toBe('INVALID_ARGUMENTS');
  });

  it('returns INVALID_ARGUMENTS for an unknown command over the socket', async () => {
    const raw = await socketRoundTrip(sockPath, JSON.stringify({ command: 'bogus', args: {} }) + '\n');
    expect(JSON.parse(raw).code).toBe('INVALID_ARGUMENTS');
  });

  it('handles a valid start command end-to-end over the socket', async () => {
    const raw = await socketRoundTrip(sockPath, JSON.stringify({ command: 'start', args: {} }) + '\n');
    const parsed = JSON.parse(raw);
    expect(parsed.message).toBe('Session started');
    expect(typeof parsed.sessionId).toBe('string');
  });

  it('does not crash when a connection sends multiple commands', async () => {
    const responses = await new Promise<string[]>((resolve, reject) => {
      const client = net.createConnection(sockPath);
      const received: string[] = [];
      let buf = '';
      client.on('data', chunk => {
        buf += chunk.toString();
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          received.push(buf.slice(0, idx));
          buf = buf.slice(idx + 1);
          if (received.length === 2) { client.destroy(); resolve(received); }
        }
      });
      client.on('error', reject);
      client.once('connect', () => {
        client.write(JSON.stringify({ command: 'start', args: {} }) + '\n');
        client.write(JSON.stringify({ command: 'bogus', args: {} }) + '\n');
      });
    });
    // Responses arrive in dispatch-completion order (start is async, bogus is sync),
    // so we assert presence rather than position.
    expect(responses).toHaveLength(2);
    const parsed = responses.map(r => JSON.parse(r));
    expect(parsed.some((r: { message?: string }) => r.message === 'Session started')).toBe(true);
    expect(parsed.some((r: { code?: string }) => r.code === 'INVALID_ARGUMENTS')).toBe(true);
  });
});
