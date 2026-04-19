import * as fs from 'fs';
import * as path from 'path';
import type { BrowserContext, Page } from 'playwright';
import TurndownService from 'turndown';
import { BrowserToolError, mapPlaywrightError } from '../errors';
import type {
  ActionResponse,
  DownloadResponse,
  InteractiveElement,
  NavigateResponse,
  ReadResponse,
} from '../types';

// ---------------------------------------------------------------------------
// Internal types (not exported — used only within evaluate callbacks)
// ---------------------------------------------------------------------------

interface RawElement {
  type: 'link' | 'button' | 'input';
  text?: string;
  href?: string;
  name?: string;
  inputType?: string;
  selector: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

function resolveDownloadPath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let target = path.join(dir, fileName);
  let counter = 1;
  while (fs.existsSync(target)) {
    target = path.join(dir, `${base}_${counter}${ext}`);
    counter++;
  }
  return target;
}

/**
 * Maps a raw (untyped JSON) element from page.evaluate() into a typed
 * InteractiveElement, validating all required fields for each variant.
 * Returns null for elements that are missing required fields or have an
 * unrecognised type — callers should filter nulls out.
 */
function toInteractiveElement(raw: unknown): InteractiveElement | null {
  if (raw === null || typeof raw !== 'object') return null;

  const el = raw as Record<string, unknown>;
  const { type, selector } = el;

  if (typeof selector !== 'string' || selector === '') return null;

  switch (type) {
    case 'link': {
      if (typeof el.href !== 'string' || el.href === '') return null;
      return {
        type: 'link',
        text: typeof el.text === 'string' ? el.text : '',
        href: el.href,
        selector,
      };
    }
    case 'button': {
      return {
        type: 'button',
        text: typeof el.text === 'string' ? el.text : '',
        selector,
      };
    }
    case 'input': {
      return {
        type: 'input',
        name: typeof el.name === 'string' ? el.name : '',
        inputType: typeof el.inputType === 'string' ? el.inputType : 'text',
        selector,
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// BrowserSession
// ---------------------------------------------------------------------------

export class BrowserSession {
  public readonly id: string;
  public readonly tempDir: string;
  public readonly createdAt: Date;
  public lastActivityAt: Date;

  private readonly context: BrowserContext;
  private readonly page: Page;

  constructor(id: string, context: BrowserContext, page: Page, tempDir: string) {
    this.id = id;
    this.context = context;
    this.page = page;
    this.tempDir = tempDir;
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
  }

  updateActivity(): void {
    this.lastActivityAt = new Date();
  }

  // -------------------------------------------------------------------------
  // navigate
  // -------------------------------------------------------------------------

  async navigate(url: string): Promise<NavigateResponse> {
    try {
      new URL(url);
    } catch {
      throw new BrowserToolError('NAVIGATION_FAILED', `Invalid URL: ${url}`);
    }

    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });
    } catch (err) {
      mapPlaywrightError(err, 'NAVIGATION_FAILED');
    }

    this.updateActivity();
    return {
      sessionId: this.id,
      url: this.page.url(),
      title: await this.page.title(),
    };
  }

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------

  async read(): Promise<ReadResponse> {
    const screenshotPath = path.join(
      this.tempDir,
      'screenshots',
      `screenshot-${Date.now()}.png`,
    );

    const screenshotBuffer = await this.page.screenshot({ fullPage: true });
    await fs.promises.writeFile(screenshotPath, screenshotBuffer);

    const bodyHtml = await this.page.evaluate(() => {
      const HIDDEN_MARKER = 'data-browser-tool-hidden';

      // Mark computed-hidden elements on the live DOM (getComputedStyle needs live elements).
      document.body.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
          el.setAttribute(HIDDEN_MARKER, '1');
        }
      });

      try {
        const clone = document.body.cloneNode(true) as HTMLElement;
        // Remove hidden elements (computed-hidden marker, attribute-hidden, aria-hidden).
        clone
          .querySelectorAll(
            `[${HIDDEN_MARKER}], [hidden], [aria-hidden="true"], script, style, noscript`,
          )
          .forEach(el => el.remove());
        return clone.innerHTML;
      } finally {
        // Remove markers from the live DOM regardless of outcome.
        document.body.querySelectorAll(`[${HIDDEN_MARKER}]`).forEach(el => {
          el.removeAttribute(HIDDEN_MARKER);
        });
      }
    });

    const markdown = turndown.turndown(bodyHtml);
    const rawElements = await this.extractInteractiveElements();
    const interactiveElements = rawElements
      .map(toInteractiveElement)
      .filter((el): el is InteractiveElement => el !== null);

    this.updateActivity();
    return {
      sessionId: this.id,
      url: this.page.url(),
      title: await this.page.title(),
      markdown,
      screenshotPath,
      interactiveElements,
    };
  }

  // -------------------------------------------------------------------------
  // click
  // -------------------------------------------------------------------------

  async click(selector?: string, coords?: { x: number; y: number }): Promise<ActionResponse> {
    try {
      if (selector !== undefined) {
        await this.page.click(selector);
      } else if (coords !== undefined) {
        await this.page.mouse.click(coords.x, coords.y);
      } else {
        throw new BrowserToolError('INVALID_ARGUMENTS', 'click requires --selector or --coords');
      }
      await this.page.waitForLoadState('networkidle');
    } catch (err) {
      if (err instanceof BrowserToolError) throw err;
      mapPlaywrightError(err, 'ELEMENT_NOT_FOUND');
    }

    this.updateActivity();
    return {
      sessionId: this.id,
      action: 'click',
      target: selector ?? `${coords!.x},${coords!.y}`,
    };
  }

  // -------------------------------------------------------------------------
  // type
  // -------------------------------------------------------------------------

  async type(selector: string, text: string): Promise<ActionResponse> {
    try {
      await this.page.fill(selector, text);
    } catch (err) {
      mapPlaywrightError(err, 'ELEMENT_NOT_FOUND');
    }

    this.updateActivity();
    return {
      sessionId: this.id,
      action: 'type',
      target: selector,
      text,
    };
  }

  // -------------------------------------------------------------------------
  // scroll
  // -------------------------------------------------------------------------

  async scroll(direction: 'up' | 'down', amount: number): Promise<ActionResponse> {
    const delta = direction === 'down' ? amount : -amount;
    await this.page.evaluate((dy: number) => window.scrollBy(0, dy), delta);

    this.updateActivity();
    return {
      sessionId: this.id,
      action: 'scroll',
      target: 'window',
      direction,
      amount,
    };
  }

  // -------------------------------------------------------------------------
  // hover
  // -------------------------------------------------------------------------

  async hover(selector?: string, coords?: { x: number; y: number }): Promise<ActionResponse> {
    try {
      if (selector !== undefined) {
        await this.page.hover(selector);
      } else if (coords !== undefined) {
        await this.page.mouse.move(coords.x, coords.y);
      } else {
        throw new BrowserToolError('INVALID_ARGUMENTS', 'hover requires --selector or --coords');
      }
    } catch (err) {
      if (err instanceof BrowserToolError) throw err;
      mapPlaywrightError(err, 'ELEMENT_NOT_FOUND');
    }

    this.updateActivity();
    return {
      sessionId: this.id,
      action: 'hover',
      target: selector ?? `${coords!.x},${coords!.y}`,
    };
  }

  // -------------------------------------------------------------------------
  // upload
  // -------------------------------------------------------------------------

  async upload(selector: string, filePath: string): Promise<ActionResponse> {
    if (!fs.existsSync(filePath)) {
      throw new BrowserToolError('UPLOAD_FAILED', `File not found: ${filePath}`);
    }

    try {
      await this.page.setInputFiles(selector, filePath);
    } catch (err) {
      // All Playwright errors during upload are surfaced as UPLOAD_FAILED
      // (the selector might be wrong, the element might not be a file input, etc.)
      const message = err instanceof Error ? err.message : String(err);
      throw new BrowserToolError('UPLOAD_FAILED', message);
    }

    this.updateActivity();
    return {
      sessionId: this.id,
      action: 'upload',
      target: selector,
      file: filePath,
    };
  }

  // -------------------------------------------------------------------------
  // download
  // -------------------------------------------------------------------------

  async download(selector: string): Promise<DownloadResponse> {
    const downloadsDir = path.join(this.tempDir, 'downloads');

    // Register the listener BEFORE clicking so the event is never missed.
    const downloadPromise = this.page.waitForEvent('download', { timeout: 30_000 });

    // Click the trigger element in its own try/catch. If the click fails, the
    // download listener has no event to receive and will time out after 30 s.
    // Attach a no-op rejection handler now so that future timeout rejection is
    // handled and does not become an unhandled promise rejection.
    try {
      await this.page.click(selector);
    } catch (clickErr) {
      void downloadPromise.catch(() => undefined);
      const message = clickErr instanceof Error ? clickErr.message : String(clickErr);
      throw new BrowserToolError('DOWNLOAD_FAILED', message);
    }

    let downloadResult: DownloadResponse;
    try {
      const dl = await downloadPromise;

      const failure = await dl.failure();
      if (failure !== null) {
        throw new BrowserToolError('DOWNLOAD_FAILED', failure);
      }

      const fileName = dl.suggestedFilename();
      const filePath = resolveDownloadPath(downloadsDir, fileName);
      await dl.saveAs(filePath);

      downloadResult = {
        sessionId: this.id,
        action: 'download',
        filePath,
        fileName,
      };
    } catch (err) {
      if (err instanceof BrowserToolError) throw err;
      mapPlaywrightError(err, 'DOWNLOAD_FAILED');
    }

    this.updateActivity();
    return downloadResult!;
  }

  // -------------------------------------------------------------------------
  // wait
  // -------------------------------------------------------------------------

  async wait(selector: string, timeout: number): Promise<ActionResponse> {
    try {
      await this.page.waitForSelector(selector, { timeout });
    } catch (err) {
      mapPlaywrightError(err, 'TIMEOUT');
    }

    this.updateActivity();
    return {
      sessionId: this.id,
      action: 'wait',
      target: selector,
    };
  }

  // -------------------------------------------------------------------------
  // destroy — must never throw
  // -------------------------------------------------------------------------

  async destroy(): Promise<void> {
    try {
      await this.page.close();
    } catch {
      // Ignore — page may already be closed
    }

    try {
      await this.context.close();
    } catch {
      // Ignore — context may already be closed
    }

    try {
      await fs.promises.rm(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore — dir may not exist
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async extractInteractiveElements(): Promise<RawElement[]> {
    return this.page.evaluate((): RawElement[] => {
      function makeSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const named = (el as HTMLInputElement).name;
        if (named) return `${tag}[name="${named}"]`;
        // Count same-tag siblings preceding this element (nth-of-type is 1-indexed)
        let nth = 1;
        let sibling = el.previousElementSibling;
        while (sibling !== null) {
          if (sibling.tagName === el.tagName) nth++;
          sibling = sibling.previousElementSibling;
        }
        return `${tag}:nth-of-type(${nth})`;
      }

      const results: RawElement[] = [];

      // Links
      document.querySelectorAll('a[href]').forEach(el => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.getAttribute('href') ?? '';
        if (href.startsWith('javascript:') || href === '#') return;
        results.push({
          type: 'link',
          text: anchor.textContent?.trim() ?? '',
          href: anchor.href,
          selector: makeSelector(anchor),
        });
      });

      // Buttons (button elements + submit/button inputs)
      document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(el => {
        const btn = el as HTMLButtonElement | HTMLInputElement;
        const text =
          btn.tagName === 'BUTTON'
            ? btn.textContent?.trim() ?? ''
            : (btn as HTMLInputElement).value;
        results.push({
          type: 'button',
          text,
          selector: makeSelector(btn),
        });
      });

      // Form inputs
      const inputSelector =
        'input:not([type="button"]):not([type="submit"]):not([type="hidden"]),' +
        'textarea,select';
      document.querySelectorAll(inputSelector).forEach(el => {
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        results.push({
          type: 'input',
          name: input.name || input.id || '',
          inputType: (input as HTMLInputElement).type ?? el.tagName.toLowerCase(),
          selector: makeSelector(input),
        });
      });

      return results;
    });
  }
}
