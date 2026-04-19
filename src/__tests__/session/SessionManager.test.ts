import * as fs from 'fs';
import type { Browser, BrowserContext, Page } from 'playwright';
import { SessionManager } from '../../session/SessionManager';
import { BrowserSession } from '../../session/BrowserSession';
import { BrowserToolError } from '../../errors';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../session/BrowserSession');
const MockBrowserSession = BrowserSession as jest.MockedClass<typeof BrowserSession>;

// Make the BrowserSession constructor capture the id argument so that
// session.id reflects what SessionManager passes to it.
beforeEach(() => {
  MockBrowserSession.mockImplementation((id: string) => {
    const instance = {
      id,
      tempDir: `/tmp/browser-tool/${id}`,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      updateActivity: jest.fn(),
      navigate: jest.fn(),
      read: jest.fn(),
      click: jest.fn(),
      type: jest.fn(),
      scroll: jest.fn(),
      hover: jest.fn(),
      upload: jest.fn(),
      download: jest.fn(),
      wait: jest.fn(),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    return instance as unknown as BrowserSession;
  });
});

function makeMockBrowser(): Browser {
  const mockPage = { close: jest.fn().mockResolvedValue(undefined) } as unknown as Page;
  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext;
  return {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as Browser;
}

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('SessionManager.createSession', () => {
  beforeEach(() => jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined));
  afterEach(() => jest.restoreAllMocks());

  it('creates sessions with unique IDs', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const s1 = await manager.createSession();
    const s2 = await manager.createSession();
    expect(s1.id).toBeDefined();
    expect(s2.id).toBeDefined();
    expect(s1.id).not.toBe(s2.id);
    await manager.shutdown();
  });

  it('creates temp dirs for screenshots and downloads', async () => {
    const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const manager = new SessionManager(makeMockBrowser());
    await manager.createSession();
    const calls = mkdirSpy.mock.calls.map(c => c[0] as string);
    expect(calls.some(p => p.includes('screenshots'))).toBe(true);
    expect(calls.some(p => p.includes('downloads'))).toBe(true);
    await manager.shutdown();
  });

  it('registers the session so getSession can retrieve it', async () => {
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();
    expect(() => manager.getSession(session.id)).not.toThrow();
    await manager.shutdown();
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('SessionManager.getSession', () => {
  beforeEach(() => jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined));
  afterEach(() => jest.restoreAllMocks());

  it('returns the session for a known id', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();
    const found = manager.getSession(session.id);
    expect(found.id).toBe(session.id);
    await manager.shutdown();
  });

  it('throws SESSION_NOT_FOUND for an unknown id', () => {
    const manager = new SessionManager(makeMockBrowser());
    expect(() => manager.getSession('does-not-exist')).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    );
  });

  it('throws SESSION_NOT_FOUND after the session has been destroyed', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();
    await manager.destroySession(session.id);
    expect(() => manager.getSession(session.id)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    );
  });

  it('throws a BrowserToolError', () => {
    const manager = new SessionManager(makeMockBrowser());
    expect(() => manager.getSession('x')).toThrow(BrowserToolError);
  });
});

// ---------------------------------------------------------------------------
// destroySession
// ---------------------------------------------------------------------------

describe('SessionManager.destroySession', () => {
  beforeEach(() => jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined));
  afterEach(() => jest.restoreAllMocks());

  it('calls session.destroy()', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();
    await manager.destroySession(session.id);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('removes the session from the map', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();
    await manager.destroySession(session.id);
    expect(() => manager.getSession(session.id)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    );
  });

  it('is a no-op for an unknown session id', async () => {
    const manager = new SessionManager(makeMockBrowser());
    await expect(manager.destroySession('unknown-id')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Idle timer
// ---------------------------------------------------------------------------

describe('SessionManager idle timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('destroys the session after 1 hour of inactivity', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();

    jest.advanceTimersByTime(60 * 60 * 1_000 + 1);
    await Promise.resolve();

    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('resets the idle timer on getSession', async () => {
    const manager = new SessionManager(makeMockBrowser());
    const session = await manager.createSession();

    // Advance to just before the timeout
    jest.advanceTimersByTime(59 * 60 * 1_000);
    // Accessing the session resets the timer
    manager.getSession(session.id);
    // Advance another 59 minutes — should NOT have timed out yet
    jest.advanceTimersByTime(59 * 60 * 1_000);
    await Promise.resolve();
    expect(session.destroy).not.toHaveBeenCalled();

    // Advance past the full hour from last access
    jest.advanceTimersByTime(2 * 60 * 1_000);
    await Promise.resolve();
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// shutdown
// ---------------------------------------------------------------------------

describe('SessionManager.shutdown', () => {
  beforeEach(() => jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined));
  afterEach(() => jest.restoreAllMocks());

  it('destroys all active sessions and closes the browser', async () => {
    const browser = makeMockBrowser();
    const manager = new SessionManager(browser);
    const s1 = await manager.createSession();
    const s2 = await manager.createSession();

    await manager.shutdown();

    expect(s1.destroy).toHaveBeenCalledTimes(1);
    expect(s2.destroy).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('does not throw if browser.close() rejects', async () => {
    const browser = makeMockBrowser();
    (browser.close as jest.Mock).mockRejectedValue(new Error('already closed'));
    const manager = new SessionManager(browser);
    await expect(manager.shutdown()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cleanupStaleTempDirs
// ---------------------------------------------------------------------------

describe('SessionManager.cleanupStaleTempDirs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('removes session directories but leaves daemon.sock and daemon.pid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(['abc-session', 'daemon.sock', 'daemon.pid'] as any);
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ isDirectory: () => true } as fs.Stats);
    const rmSpy = jest.spyOn(fs.promises, 'rm').mockResolvedValue();

    await SessionManager.cleanupStaleTempDirs();

    const removed = rmSpy.mock.calls.map(c => String(c[0]));
    expect(removed.some(p => p.includes('abc-session'))).toBe(true);
    expect(removed.some(p => p.includes('daemon.sock'))).toBe(false);
    expect(removed.some(p => p.includes('daemon.pid'))).toBe(false);
  });

  it('does not throw if the base directory does not exist', async () => {
    jest.spyOn(fs.promises, 'readdir').mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    await expect(SessionManager.cleanupStaleTempDirs()).resolves.toBeUndefined();
  });
});
