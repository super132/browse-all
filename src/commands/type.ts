import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { ActionResponse } from '../types';

export async function typeText(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<ActionResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  const { selector, text } = args;
  if (typeof selector !== 'string' || selector === '') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--selector is required');
  }
  if (typeof text !== 'string') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--text is required');
  }
  return manager.getSession(sessionId).type(selector, text);
}
