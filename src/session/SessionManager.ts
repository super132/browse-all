import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Browser } from 'playwright';
import { BASE_DIR } from '../constants';
import { BrowserToolError } from '../errors';
import { BrowserSession } from './BrowserSession';
const IDLE_TIMEOUT_MS = 60 * 60 * 1_000; // 1 hour

export class SessionManager {
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly browser: Browser;

  constructor(browser: Browser) {
    this.browser = browser;
  }

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------

  async createSession(): Promise<BrowserSession> {
    const id = randomUUID();
    const context = await this.browser.newContext();
    const page = await context.newPage();

    const tempDir = path.join(BASE_DIR, id);
    await fs.promises.mkdir(path.join(tempDir, 'screenshots'), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, 'downloads'), { recursive: true });

    const session = new BrowserSession(id, context, page, tempDir);
    this.sessions.set(id, session);
    this.startIdleTimer(id);

    return session;
  }

  // -------------------------------------------------------------------------
  // getSession — resets idle timer on access
  // -------------------------------------------------------------------------

  getSession(id: string): BrowserSession {
    const session = this.sessions.get(id);
    if (session === undefined) {
      throw new BrowserToolError('SESSION_NOT_FOUND', `Session '${id}' not found or has expired`);
    }
    this.resetIdleTimer(id);
    return session;
  }

  // -------------------------------------------------------------------------
  // destroySession — no-op if session not found
  // -------------------------------------------------------------------------

  async destroySession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) return;

    this.sessions.delete(id);
    this.clearIdleTimer(id);
    await session.destroy();
  }

  // -------------------------------------------------------------------------
  // shutdown — destroy all sessions and close the shared browser
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.allSettled(ids.map(id => this.destroySession(id)));
    try {
      await this.browser.close();
    } catch {
      // Ignore — browser may already be closed
    }
  }

  // -------------------------------------------------------------------------
  // cleanupStaleTempDirs — call once at daemon startup
  // -------------------------------------------------------------------------

  static async cleanupStaleTempDirs(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(BASE_DIR);
    } catch {
      return; // Base dir doesn't exist yet — nothing to clean
    }

    await Promise.allSettled(
      entries
        .filter(e => e !== 'daemon.sock' && e !== 'daemon.pid')
        .map(async e => {
          const fullPath = path.join(BASE_DIR, e);
          try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.isDirectory()) {
              await fs.promises.rm(fullPath, { recursive: true, force: true });
            }
          } catch {
            // Ignore individual cleanup failures
          }
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Idle timer helpers
  // -------------------------------------------------------------------------

  private startIdleTimer(id: string): void {
    const timer = setTimeout(() => {
      void this.destroySession(id);
    }, IDLE_TIMEOUT_MS);
    // Unref so the timer doesn't prevent the process from exiting naturally
    timer.unref();
    this.timers.set(id, timer);
  }

  private resetIdleTimer(id: string): void {
    this.clearIdleTimer(id);
    this.startIdleTimer(id);
  }

  private clearIdleTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
