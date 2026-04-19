import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { ReadResponse } from '../types';

export async function read(
  sessionId: string | undefined,
  _args: Record<string, unknown>,
  manager: SessionManager,
): Promise<ReadResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  return manager.getSession(sessionId).read();
}
