import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { ActionResponse } from '../types';

export async function wait(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<ActionResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }
  const { selector } = args;
  if (typeof selector !== 'string' || selector === '') {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--selector is required');
  }

  const rawTimeout = args.timeout ?? 30_000;
  if (!Number.isInteger(rawTimeout) || (rawTimeout as number) <= 0) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--timeout must be a positive integer');
  }

  return manager.getSession(sessionId).wait(selector, rawTimeout as number);
}
