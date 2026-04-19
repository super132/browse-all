import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { ActionResponse } from '../types';

export async function upload(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<ActionResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  const { selector, filePath } = args;
  if (typeof selector !== 'string' || selector === '') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--selector is required');
  }
  if (typeof filePath !== 'string' || filePath === '') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--file-path is required');
  }
  return manager.getSession(sessionId).upload(selector, filePath);
}
