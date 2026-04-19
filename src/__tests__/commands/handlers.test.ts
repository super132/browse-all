/**
 * Unit tests for start, navigate, read, type, hover, upload, download, close handlers.
 * click, scroll, and wait have their own test files for extra validation coverage.
 */
import type { BrowserSession } from '../../session/BrowserSession';
import type { SessionManager } from '../../session/SessionManager';
import { BrowserToolError } from '../../errors';
import { start } from '../../commands/start';
import { navigate } from '../../commands/navigate';
import { read } from '../../commands/read';
import { typeText } from '../../commands/type';
import { hover } from '../../commands/hover';
import { upload } from '../../commands/upload';
import { download } from '../../commands/download';
import { close } from '../../commands/close';

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    id: 'sess-1',
    navigate: jest.fn().mockResolvedValue({ sessionId: 'sess-1', url: 'https://x.com', title: 'X' }),
    read: jest.fn().mockResolvedValue({ sessionId: 'sess-1', url: 'https://x.com', title: 'X', markdown: '# X', screenshotPath: '/tmp/s.png', interactiveElements: [] }),
    click: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'click', target: '#btn' }),
    type: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'type', target: '#inp', text: 'hi' }),
    hover: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'hover', target: '#menu' }),
    upload: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'upload', target: '#file', file: '/f.pdf' }),
    download: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'download', filePath: '/tmp/dl/f.pdf', fileName: 'f.pdf' }),
    ...overrides,
  } as unknown as BrowserSession;
}

function makeManager(session: BrowserSession): SessionManager {
  return {
    createSession: jest.fn().mockResolvedValue(session),
    getSession: jest.fn().mockReturnValue(session),
    destroySession: jest.fn().mockResolvedValue(undefined),
  } as unknown as SessionManager;
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

describe('start handler', () => {
  it('creates a session and returns StartResponse', async () => {
    const session = makeSession({ id: 'new-id' });
    const manager = makeManager(session);
    const result = await start(undefined, {}, manager);
    expect(manager.createSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sessionId: 'new-id', message: 'Session started' });
  });
});

// ---------------------------------------------------------------------------
// navigate
// ---------------------------------------------------------------------------

describe('navigate handler', () => {
  it('calls session.navigate with the url', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    const result = await navigate('sess-1', { url: 'https://example.com' }, manager);
    expect(session.navigate).toHaveBeenCalledWith('https://example.com');
    expect(result).toMatchObject({ url: 'https://x.com' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    const manager = makeManager(makeSession());
    await expect(navigate(undefined, { url: 'https://x.com' }, manager)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  });

  it('throws INVALID_ARGUMENTS when url is missing', async () => {
    const manager = makeManager(makeSession());
    await expect(navigate('sess-1', {}, manager)).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when url is empty string', async () => {
    const manager = makeManager(makeSession());
    await expect(navigate('sess-1', { url: '' }, manager)).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('propagates SESSION_NOT_FOUND from getSession', async () => {
    const manager = makeManager(makeSession());
    (manager.getSession as jest.Mock).mockImplementation(() => {
      throw new BrowserToolError('SESSION_NOT_FOUND', 'not found');
    });
    await expect(navigate('bad-id', { url: 'https://x.com' }, manager)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe('read handler', () => {
  it('calls session.read and returns ReadResponse', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    const result = await read('sess-1', {}, manager);
    expect(session.read).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ markdown: '# X' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    await expect(read(undefined, {}, makeManager(makeSession()))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  });
});

// ---------------------------------------------------------------------------
// type (typeText)
// ---------------------------------------------------------------------------

describe('type handler', () => {
  it('calls session.type with selector and text', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    const result = await typeText('sess-1', { selector: '#inp', text: 'hello' }, manager);
    expect(session.type).toHaveBeenCalledWith('#inp', 'hello');
    expect(result).toMatchObject({ action: 'type', text: 'hi' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    await expect(typeText(undefined, { selector: '#inp', text: 'x' }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when selector is missing', async () => {
    await expect(typeText('sess-1', { text: 'x' }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when text is missing', async () => {
    await expect(typeText('sess-1', { selector: '#inp' }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });
});

// ---------------------------------------------------------------------------
// hover
// ---------------------------------------------------------------------------

describe('hover handler', () => {
  it('calls session.hover with selector', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    await hover('sess-1', { selector: '#menu' }, manager);
    expect(session.hover).toHaveBeenCalledWith('#menu');
  });

  it('calls session.hover with coords', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    await hover('sess-1', { coords: { x: 10, y: 20 } }, manager);
    expect(session.hover).toHaveBeenCalledWith(undefined, { x: 10, y: 20 });
  });

  it('throws INVALID_ARGUMENTS when neither selector nor coords provided', async () => {
    await expect(hover('sess-1', {}, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when both selector and coords provided', async () => {
    await expect(hover('sess-1', { selector: '#x', coords: { x: 1, y: 2 } }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS for invalid coords shape', async () => {
    await expect(hover('sess-1', { coords: 'bad' }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });
});

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

describe('upload handler', () => {
  it('calls session.upload with selector and filePath', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    await upload('sess-1', { selector: '#file', filePath: '/f.pdf' }, manager);
    expect(session.upload).toHaveBeenCalledWith('#file', '/f.pdf');
  });

  it('throws INVALID_ARGUMENTS when selector is missing', async () => {
    await expect(upload('sess-1', { filePath: '/f.pdf' }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when filePath is missing', async () => {
    await expect(upload('sess-1', { selector: '#file' }, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe('download handler', () => {
  it('calls session.download with selector', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    const result = await download('sess-1', { selector: '#dl' }, manager);
    expect(session.download).toHaveBeenCalledWith('#dl');
    expect(result).toMatchObject({ fileName: 'f.pdf' });
  });

  it('throws INVALID_ARGUMENTS when selector is missing', async () => {
    await expect(download('sess-1', {}, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });
});

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------

describe('close handler', () => {
  it('calls destroySession and returns CloseResponse', async () => {
    const session = makeSession();
    const manager = makeManager(session);
    const result = await close('sess-1', {}, manager);
    expect(manager.destroySession).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ sessionId: 'sess-1', message: 'Session closed' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    await expect(close(undefined, {}, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });
});
