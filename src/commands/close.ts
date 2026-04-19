import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { CloseResponse } from '../types';

export async function close(
  sessionId: string | undefined,
  _args: Record<string, unknown>,
  manager: SessionManager,
): Promise<CloseResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  await manager.destroySession(sessionId);
  return { sessionId, message: 'Session closed' };
}
