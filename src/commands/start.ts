import type { SessionManager } from '../session/SessionManager';
import type { StartResponse } from '../types';

export async function start(
  _sessionId: string | undefined,
  _args: Record<string, unknown>,
  manager: SessionManager,
): Promise<StartResponse> {
  const session = await manager.createSession();
  return { sessionId: session.id, message: 'Session started' };
}
