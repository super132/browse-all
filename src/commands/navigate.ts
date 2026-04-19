import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { NavigateResponse } from '../types';

export async function navigate(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<NavigateResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  const { url } = args;
  if (typeof url !== 'string' || url === '') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--url is required');
  }
  return manager.getSession(sessionId).navigate(url);
}
