import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { ActionResponse } from '../types';

export async function scroll(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<ActionResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }

  const { direction } = args;
  if (direction !== 'up' && direction !== 'down') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--direction must be "up" or "down"');
  }

  const rawAmount = args.amount ?? 500;
  if (!Number.isInteger(rawAmount) || (rawAmount as number) <= 0) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--amount must be a positive integer');
  }

  return manager.getSession(sessionId).scroll(direction, rawAmount as number);
}
