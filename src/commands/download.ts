import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { DownloadResponse } from '../types';

export async function download(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<DownloadResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  const { selector } = args;
  if (typeof selector !== 'string' || selector === '') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--selector is required');
  }
  return manager.getSession(sessionId).download(selector);
}
