import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { sendCommand } from '../../daemon/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpSock(): string {
  return path.join(os.tmpdir(), `bt-client-test-${process.pid}-${Date.now()}.sock`);
}

/** Spin up a minimal echo server that replies with a fixed JSON response. */
function startEchoServer(
  sockPath: string,
  responseBuilder: (req: unknown) => unknown,
): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      let buf = '';
      socket.on('data', chunk => {
        buf += chunk.toString();
        const idx = buf.indexOf('\n');
        if (idx !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          try {
            const req = JSON.parse(line);
            socket.write(JSON.stringify(responseBuilder(req)) + '\n');
          } catch {
            socket.write(JSON.stringify({ error: 'bad', code: 'INVALID_ARGUMENTS' }) + '\n');
          }
        }
      });
    });
    server.once('error', reject);
    server.listen(sockPath, () => resolve(server));
  });
}

function closeServer(server: net.Server, sockPath: string): Promise<void> {
  return new Promise(resolve => {
    // closeAllConnections() (Node 18.2+) force-closes lingering connections
    // so server.close() doesn't block waiting for them to drain naturally.
    (server as net.Server & { closeAllConnections?(): void }).closeAllConnections?.();
    server.close(() => fs.unlink(sockPath, () => resolve()));
  });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('sendCommand', () => {
  it('serialises the request and deserialises the response', async () => {
    const sockPath = tmpSock();
    const server = await startEchoServer(sockPath, _req => ({
      sessionId: 'abc',
      message: 'Session started',
    }));
    try {
      const result = await sendCommand('start', {}, undefined, { sockPath });
      expect(result).toEqual({ sessionId: 'abc', message: 'Session started' });
    } finally {
      await closeServer(server, sockPath);
    }
  });

  it('includes sessionId in the serialised request', async () => {
    const sockPath = tmpSock();
    let captured: unknown;
    const server = await startEchoServer(sockPath, req => {
      captured = req;
      return { sessionId: 's', url: 'https://x.com', title: 'X' };
    });
    try {
      await sendCommand('navigate', { url: 'https://x.com' }, 'sess-1', { sockPath });
      expect((captured as Record<string, unknown>).sessionId).toBe('sess-1');
      expect((captured as Record<string, unknown>).command).toBe('navigate');
    } finally {
      await closeServer(server, sockPath);
    }
  });

  it('returns an ErrorResponse without throwing', async () => {
    const sockPath = tmpSock();
    const server = await startEchoServer(sockPath, _req => ({
      error: 'not found',
      code: 'SESSION_NOT_FOUND',
    }));
    try {
      const result = await sendCommand('read', {}, 'bad-id', { sockPath });
      expect(result).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    } finally {
      await closeServer(server, sockPath);
    }
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it('rejects with INVALID_ARGUMENTS when server returns invalid JSON', async () => {
    const sockPath = tmpSock();
    const server = await new Promise<net.Server>((resolve, reject) => {
      const s = net.createServer(socket => {
        socket.once('data', () => socket.write('not-json-at-all\n'));
      });
      s.once('error', reject);
      s.listen(sockPath, () => resolve(s));
    });
    try {
      await expect(sendCommand('start', {}, undefined, { sockPath })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      });
    } finally {
      await closeServer(server, sockPath);
    }
  });

  it('rejects with INVALID_ARGUMENTS when server closes without responding', async () => {
    const sockPath = tmpSock();
    const server = await new Promise<net.Server>((resolve, reject) => {
      const s = net.createServer(socket => {
        socket.once('data', () => socket.destroy());
      });
      s.once('error', reject);
      s.listen(sockPath, () => resolve(s));
    });
    try {
      await expect(sendCommand('start', {}, undefined, { sockPath })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      });
    } finally {
      await closeServer(server, sockPath);
    }
  });

  // -------------------------------------------------------------------------
  // Auto-start: _spawnDaemon is injected so no real process is ever spawned
  // -------------------------------------------------------------------------

  it('calls _spawnDaemon once and retries when socket does not exist', async () => {
    const sockPath = tmpSock(); // nothing listening
    const spawnMock = jest.fn();

    await expect(
      sendCommand('start', {}, undefined, {
        sockPath,
        backoffMs: [5, 5, 5, 5, 5],
        _spawnDaemon: spawnMock,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });

    // spawn called exactly once (on the first retry)
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Response timeout — uses a real 50 ms timer; no fake timers needed
  // -------------------------------------------------------------------------

  it('rejects with INVALID_ARGUMENTS after the response timeout elapses', async () => {
    const sockPath = tmpSock();
    // Server that accepts connections but never sends a response
    const server = await new Promise<net.Server>((resolve, reject) => {
      const s = net.createServer(socket => {
        socket.resume(); // flowing mode so TCP cleanup works
      });
      s.once('error', reject);
      s.listen(sockPath, () => resolve(s));
    });
    try {
      await expect(
        sendCommand('start', {}, undefined, { sockPath, timeoutMs: 50 }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    } finally {
      await closeServer(server, sockPath);
    }
  }, 8_000);

  // -------------------------------------------------------------------------
  // Clean disconnect
  // -------------------------------------------------------------------------

  it('destroys the socket after receiving a response', async () => {
    const sockPath = tmpSock();
    const serverSockets: net.Socket[] = [];
    const server = await new Promise<net.Server>((resolve, reject) => {
      const s = net.createServer(socket => {
        serverSockets.push(socket);
        let buf = '';
        socket.on('data', chunk => {
          buf += chunk.toString();
          if (buf.includes('\n')) {
            socket.write(JSON.stringify({ sessionId: 'x', message: 'Session started' }) + '\n');
          }
        });
      });
      s.once('error', reject);
      s.listen(sockPath, () => resolve(s));
    });
    try {
      await sendCommand('start', {}, undefined, { sockPath });
      // Give a tick for the destroy to propagate to the server side
      await new Promise(r => setTimeout(r, 20));
      for (const sock of serverSockets) {
        expect(sock.destroyed || !sock.readable).toBe(true);
      }
    } finally {
      await closeServer(server, sockPath);
    }
  });
});
