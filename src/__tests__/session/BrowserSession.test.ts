import * as fs from 'fs';
import * as path from 'path';
import type { BrowserContext, Download, Page } from 'playwright';
import { BrowserSession } from '../../session/BrowserSession';
import { BrowserToolError } from '../../errors';

// fs.existsSync is non-configurable in Node 18+ so we mock the whole module.
// All other fs functions fall through to the real implementation.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
}));

const mockExistsSync = fs.existsSync as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPage(overrides: Partial<Page> = {}): Page {
  return {
    goto: jest.fn().mockResolvedValue(null),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    hover: jest.fn().mockResolvedValue(undefined),
    setInputFiles: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(null),
    waitForEvent: jest.fn(),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue([]),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('png')),
    url: jest.fn().mockReturnValue('https://example.com'),
    title: jest.fn().mockResolvedValue('Example'),
    content: jest.fn().mockResolvedValue('<html><body></body></html>'),
    mouse: {
      click: jest.fn().mockResolvedValue(undefined),
      move: jest.fn().mockResolvedValue(undefined),
    },
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Page;
}

function makeMockContext(overrides: Partial<BrowserContext> = {}): BrowserContext {
  return {
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BrowserContext;
}

function makeSession(pageParts: Partial<Page> = {}, tempDir = '/tmp/browser-tool/test-session'): BrowserSession {
  return new BrowserSession('test-session', makeMockContext(), makeMockPage(pageParts), tempDir);
}

// ---------------------------------------------------------------------------
// navigate
// ---------------------------------------------------------------------------

describe('BrowserSession.navigate', () => {
  it('returns url and title on success', async () => {
    const session = makeSession({
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Example Domain'),
    });
    const result = await session.navigate('https://example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('Example Domain');
    expect(result.sessionId).toBe('test-session');
  });

  it('throws NAVIGATION_FAILED for an invalid URL', async () => {
    const session = makeSession();
    await expect(session.navigate('not-a-url')).rejects.toMatchObject({
      code: 'NAVIGATION_FAILED',
    });
  });

  it('maps net:: Playwright error to NAVIGATION_FAILED', async () => {
    const session = makeSession({
      goto: jest.fn().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED')),
    });
    await expect(session.navigate('https://no-such-host.invalid')).rejects.toMatchObject({
      code: 'NAVIGATION_FAILED',
    });
  });

  it('maps Playwright TimeoutError to NAVIGATION_FAILED', async () => {
    const err = new Error('page.goto: Timeout 30000ms exceeded');
    err.name = 'TimeoutError';
    const session = makeSession({ goto: jest.fn().mockRejectedValue(err) });
    await expect(session.navigate('https://slow-site.example')).rejects.toMatchObject({
      code: 'NAVIGATION_FAILED',
    });
  });

  it('updates lastActivityAt after success', async () => {
    const session = makeSession();
    const before = session.lastActivityAt;
    await new Promise(r => setTimeout(r, 5));
    await session.navigate('https://example.com');
    expect(session.lastActivityAt.getTime()).toBeGreaterThan(before.getTime());
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe('BrowserSession.read', () => {
  const TEMP_DIR = '/tmp/browser-tool/test-read';

  beforeEach(() => {
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns markdown, screenshotPath and interactiveElements', async () => {
    const mockLink = { type: 'link', text: 'Click me', href: 'https://example.com', selector: 'a' };
    const session = makeSession(
      {
        screenshot: jest.fn().mockResolvedValue(Buffer.from('png')),
        // First evaluate: body HTML; second: interactive elements
        evaluate: jest.fn()
          .mockResolvedValueOnce('<h1>Hello</h1>')
          .mockResolvedValueOnce([mockLink]),
        url: jest.fn().mockReturnValue('https://example.com'),
        title: jest.fn().mockResolvedValue('Hello Page'),
      },
      TEMP_DIR,
    );

    const result = await session.read();

    expect(result.markdown).toContain('Hello');
    expect(result.screenshotPath).toMatch(/screenshot-\d+\.png$/);
    expect(result.screenshotPath).toContain(TEMP_DIR);
    expect(result.interactiveElements).toHaveLength(1);
    expect(result.sessionId).toBe('test-session');
  });

  it('saves screenshot to the screenshots subdirectory', async () => {
    const writeFileSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce([]),
      },
      TEMP_DIR,
    );
    await session.read();
    const savedPath = writeFileSpy.mock.calls[0][0] as string;
    expect(savedPath).toContain(path.join(TEMP_DIR, 'screenshots'));
  });

  it('filters out link elements missing href', async () => {
    const badLink = { type: 'link', text: 'No href', selector: 'a' }; // missing href
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce([badLink]),
      },
      TEMP_DIR,
    );
    const result = await session.read();
    expect(result.interactiveElements).toHaveLength(0);
  });

  it('filters out elements with missing or empty selector', async () => {
    const noSelector = { type: 'button', text: 'Click', selector: '' };
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce([noSelector]),
      },
      TEMP_DIR,
    );
    const result = await session.read();
    expect(result.interactiveElements).toHaveLength(0);
  });

  it('filters out elements with unrecognised type', async () => {
    const unknown = { type: 'select', text: 'Choose', selector: 'select' };
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce([unknown]),
      },
      TEMP_DIR,
    );
    const result = await session.read();
    expect(result.interactiveElements).toHaveLength(0);
  });

  it('filters out null/non-object entries from evaluate result', async () => {
    const mixed = [
      null,
      42,
      { type: 'button', text: 'OK', selector: '#ok' },
    ];
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce(mixed),
      },
      TEMP_DIR,
    );
    const result = await session.read();
    expect(result.interactiveElements).toHaveLength(1);
    expect(result.interactiveElements[0].type).toBe('button');
  });

  it('constructs typed InteractiveElement objects explicitly for each variant', async () => {
    const rawElements = [
      { type: 'link', text: 'Home', href: 'https://example.com', selector: 'a#home' },
      { type: 'button', text: 'Submit', selector: '#submit' },
      { type: 'input', name: 'email', inputType: 'email', selector: '#email' },
    ];
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce(rawElements),
      },
      TEMP_DIR,
    );
    const result = await session.read();
    expect(result.interactiveElements).toHaveLength(3);

    const [link, button, input] = result.interactiveElements;
    expect(link).toEqual({ type: 'link', text: 'Home', href: 'https://example.com', selector: 'a#home' });
    expect(button).toEqual({ type: 'button', text: 'Submit', selector: '#submit' });
    expect(input).toEqual({ type: 'input', name: 'email', inputType: 'email', selector: '#email' });
  });

  it('defaults missing optional text/name/inputType fields rather than crashing', async () => {
    const rawElements = [
      { type: 'button', selector: '#btn' },                     // missing text
      { type: 'input', selector: '#field' },                    // missing name and inputType
    ];
    const session = makeSession(
      {
        evaluate: jest.fn()
          .mockResolvedValueOnce('<p>test</p>')
          .mockResolvedValueOnce(rawElements),
      },
      TEMP_DIR,
    );
    const result = await session.read();
    expect(result.interactiveElements).toHaveLength(2);
    expect(result.interactiveElements[0]).toEqual({ type: 'button', text: '', selector: '#btn' });
    expect(result.interactiveElements[1]).toEqual({ type: 'input', name: '', inputType: 'text', selector: '#field' });
  });
});

// ---------------------------------------------------------------------------
// click
// ---------------------------------------------------------------------------

describe('BrowserSession.click', () => {
  it('clicks by selector and waits for networkidle', async () => {
    const clickFn = jest.fn().mockResolvedValue(undefined);
    const waitFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({ click: clickFn, waitForLoadState: waitFn });

    const result = await session.click('#btn');
    expect(clickFn).toHaveBeenCalledWith('#btn');
    expect(waitFn).toHaveBeenCalledWith('networkidle');
    expect(result.target).toBe('#btn');
  });

  it('clicks by coordinates', async () => {
    const mouseClickFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({
      mouse: { click: mouseClickFn, move: jest.fn() } as unknown as Page['mouse'],
    });
    const result = await session.click(undefined, { x: 100, y: 200 });
    expect(mouseClickFn).toHaveBeenCalledWith(100, 200);
    expect(result.target).toBe('100,200');
  });

  it('throws INVALID_ARGUMENTS when neither selector nor coords provided', async () => {
    const session = makeSession();
    await expect(session.click()).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('maps strict-mode Playwright error to ELEMENT_NOT_FOUND', async () => {
    const err = new Error('strict mode violation: locator resolved to 0 elements');
    const session = makeSession({ click: jest.fn().mockRejectedValue(err) });
    await expect(session.click('#missing')).rejects.toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
  });

  it('maps TimeoutError to TIMEOUT', async () => {
    const err = new Error('timeout exceeded waiting for locator');
    err.name = 'TimeoutError';
    const session = makeSession({ click: jest.fn().mockRejectedValue(err) });
    await expect(session.click('#slow')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

describe('BrowserSession.type', () => {
  it('calls page.fill and returns ActionResponse', async () => {
    const fillFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({ fill: fillFn });
    const result = await session.type('#input', 'hello');
    expect(fillFn).toHaveBeenCalledWith('#input', 'hello');
    expect(result.text).toBe('hello');
    expect(result.target).toBe('#input');
  });

  it('maps missing selector to ELEMENT_NOT_FOUND', async () => {
    const err = new Error('No element found for selector: #ghost');
    const session = makeSession({ fill: jest.fn().mockRejectedValue(err) });
    await expect(session.type('#ghost', 'x')).rejects.toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// scroll
// ---------------------------------------------------------------------------

describe('BrowserSession.scroll', () => {
  it('scrolls down with positive delta', async () => {
    const evalFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({ evaluate: evalFn });
    const result = await session.scroll('down', 500);
    expect(evalFn).toHaveBeenCalledWith(expect.any(Function), 500);
    expect(result.direction).toBe('down');
    expect(result.amount).toBe(500);
  });

  it('scrolls up with negative delta', async () => {
    const evalFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({ evaluate: evalFn });
    await session.scroll('up', 300);
    expect(evalFn).toHaveBeenCalledWith(expect.any(Function), -300);
  });
});

// ---------------------------------------------------------------------------
// hover
// ---------------------------------------------------------------------------

describe('BrowserSession.hover', () => {
  it('hovers by selector', async () => {
    const hoverFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({ hover: hoverFn });
    const result = await session.hover('#menu');
    expect(hoverFn).toHaveBeenCalledWith('#menu');
    expect(result.target).toBe('#menu');
  });

  it('hovers by coordinates', async () => {
    const moveFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({
      mouse: { move: moveFn, click: jest.fn() } as unknown as Page['mouse'],
    });
    const result = await session.hover(undefined, { x: 50, y: 75 });
    expect(moveFn).toHaveBeenCalledWith(50, 75);
    expect(result.target).toBe('50,75');
  });

  it('throws INVALID_ARGUMENTS when neither selector nor coords provided', async () => {
    const session = makeSession();
    await expect(session.hover()).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('maps selector error to ELEMENT_NOT_FOUND', async () => {
    const err = new Error('No element found for selector: #ghost');
    const session = makeSession({ hover: jest.fn().mockRejectedValue(err) });
    await expect(session.hover('#ghost')).rejects.toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

describe('BrowserSession.upload', () => {
  afterEach(() => mockExistsSync.mockReturnValue(false));

  it('throws UPLOAD_FAILED when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const session = makeSession();
    await expect(session.upload('#file', '/no/such/file.pdf')).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
    });
  });

  it('calls setInputFiles when file exists', async () => {
    mockExistsSync.mockReturnValue(true);
    const setInputFilesFn = jest.fn().mockResolvedValue(undefined);
    const session = makeSession({ setInputFiles: setInputFilesFn });
    await session.upload('#file', '/real/file.pdf');
    expect(setInputFilesFn).toHaveBeenCalledWith('#file', '/real/file.pdf');
  });

  it('maps Playwright selector error to UPLOAD_FAILED', async () => {
    mockExistsSync.mockReturnValue(true);
    const err = new Error('No element found for selector: #bad');
    const session = makeSession({ setInputFiles: jest.fn().mockRejectedValue(err) });
    await expect(session.upload('#bad', '/real/file.pdf')).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
    });
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe('BrowserSession.download', () => {
  const TEMP_DIR = '/tmp/browser-tool/dl-session';

  // Default: no files exist yet
  beforeEach(() => mockExistsSync.mockReturnValue(false));
  afterEach(() => mockExistsSync.mockReturnValue(false));

  function makeDownload(overrides: Partial<Download> = {}): Download {
    return {
      suggestedFilename: jest.fn().mockReturnValue('report.pdf'),
      failure: jest.fn().mockResolvedValue(null),
      saveAs: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as Download;
  }

  it('saves the file to the downloads dir and returns filePath', async () => {
    const dl = makeDownload();
    const session = makeSession(
      {
        click: jest.fn().mockResolvedValue(undefined),
        waitForEvent: jest.fn().mockResolvedValue(dl),
      },
      TEMP_DIR,
    );

    const result = await session.download('#dl-btn');
    expect(dl.saveAs).toHaveBeenCalledWith(path.join(TEMP_DIR, 'downloads', 'report.pdf'));
    expect(result.fileName).toBe('report.pdf');
    expect(result.filePath).toContain('downloads');
  });

  it('resolves filename collision by appending counter', async () => {
    // First path exists; second does not
    mockExistsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const dl = makeDownload();
    const session = makeSession(
      {
        click: jest.fn().mockResolvedValue(undefined),
        waitForEvent: jest.fn().mockResolvedValue(dl),
      },
      TEMP_DIR,
    );

    const result = await session.download('#dl-btn');
    expect(result.filePath).toContain('report_1.pdf');
  });

  it('throws DOWNLOAD_FAILED when download.failure() is non-null', async () => {
    const dl = makeDownload({ failure: jest.fn().mockResolvedValue('net error') });
    const session = makeSession(
      {
        click: jest.fn().mockResolvedValue(undefined),
        waitForEvent: jest.fn().mockResolvedValue(dl),
      },
      TEMP_DIR,
    );
    await expect(session.download('#dl-btn')).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
  });

  it('throws DOWNLOAD_FAILED and does not leave an unhandled rejection when click fails', async () => {
    // waitForEvent returns a promise that never resolves (simulates the 30 s
    // timeout that would occur if the click never triggers a download).
    let rejectDownload!: (err: Error) => void;
    const neverResolves = new Promise<never>((_resolve, reject) => {
      rejectDownload = reject;
    });

    const clickErr = new Error('No element found for selector: #missing');
    const session = makeSession(
      {
        click: jest.fn().mockRejectedValue(clickErr),
        waitForEvent: jest.fn().mockReturnValue(neverResolves),
      },
      TEMP_DIR,
    );

    // The download() call must throw with DOWNLOAD_FAILED …
    await expect(session.download('#missing')).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });

    // … and the pending download promise must be silenced before we reject it,
    // so no unhandled rejection is emitted. Reject it now and confirm no
    // 'unhandledRejection' event fires.
    const unhandledRejectionSpy = jest.fn();
    process.on('unhandledRejection', unhandledRejectionSpy);
    rejectDownload(new Error('timeout'));
    await new Promise(r => setTimeout(r, 0)); // flush microtasks
    process.off('unhandledRejection', unhandledRejectionSpy);

    expect(unhandledRejectionSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// wait
// ---------------------------------------------------------------------------

describe('BrowserSession.wait', () => {
  it('resolves when selector appears', async () => {
    const waitFn = jest.fn().mockResolvedValue(null);
    const session = makeSession({ waitForSelector: waitFn });
    const result = await session.wait('#result', 5000);
    expect(waitFn).toHaveBeenCalledWith('#result', { timeout: 5000 });
    expect(result.target).toBe('#result');
  });

  it('maps TimeoutError to TIMEOUT error code', async () => {
    const err = new Error('page.waitForSelector: Timeout 5000ms exceeded');
    err.name = 'TimeoutError';
    const session = makeSession({ waitForSelector: jest.fn().mockRejectedValue(err) });
    await expect(session.wait('#never', 5000)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------

describe('BrowserSession.destroy', () => {
  afterEach(() => jest.restoreAllMocks());

  it('closes page and context', async () => {
    const closePage = jest.fn().mockResolvedValue(undefined);
    const closeCtx = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'rm').mockResolvedValue();
    const session = new BrowserSession(
      's1',
      makeMockContext({ close: closeCtx }),
      makeMockPage({ close: closePage }),
      '/tmp/browser-tool/s1',
    );
    await session.destroy();
    expect(closePage).toHaveBeenCalled();
    expect(closeCtx).toHaveBeenCalled();
  });

  it('does not throw even when page.close() rejects', async () => {
    jest.spyOn(fs.promises, 'rm').mockResolvedValue();
    const session = new BrowserSession(
      's1',
      makeMockContext(),
      makeMockPage({ close: jest.fn().mockRejectedValue(new Error('already closed')) }),
      '/tmp/browser-tool/s1',
    );
    await expect(session.destroy()).resolves.toBeUndefined();
  });

  it('does not throw even when fs.rm rejects', async () => {
    jest.spyOn(fs.promises, 'rm').mockRejectedValue(new Error('permission denied'));
    const session = new BrowserSession('s1', makeMockContext(), makeMockPage(), '/tmp/browser-tool/s1');
    await expect(session.destroy()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BrowserToolError shape
// ---------------------------------------------------------------------------

describe('BrowserToolError', () => {
  it('is an instance of Error with the correct code and name', () => {
    const err = new BrowserToolError('TIMEOUT', 'timed out');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BrowserToolError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('timed out');
    expect(err.name).toBe('BrowserToolError');
  });
});
