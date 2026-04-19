import type { ErrorCode } from './types';

export class BrowserToolError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'BrowserToolError';
    this.code = code;
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, BrowserToolError.prototype);
  }
}

/**
 * Maps a Playwright error to the most appropriate BrowserToolError.
 * Always throws — use in catch blocks: `throw mapPlaywrightError(err, 'TIMEOUT')`.
 */
export function mapPlaywrightError(error: unknown, fallback: ErrorCode): never {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  if (message.includes('net::') || message.includes('ERR_') || message.includes('ENOTFOUND')) {
    throw new BrowserToolError('NAVIGATION_FAILED', message);
  }

  if (name === 'TimeoutError' || message.toLowerCase().includes('timeout')) {
    throw new BrowserToolError(fallback === 'NAVIGATION_FAILED' ? 'NAVIGATION_FAILED' : 'TIMEOUT', message);
  }

  if (
    message.includes('strict mode violation') ||
    message.includes('No element found') ||
    message.includes('not attached to the DOM') ||
    message.includes('waiting for locator')
  ) {
    throw new BrowserToolError('ELEMENT_NOT_FOUND', message);
  }

  throw new BrowserToolError(fallback, message);
}
