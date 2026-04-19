import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { ActionResponse } from '../types';

function parseCoords(val: unknown): { x: number; y: number } | null {
  if (val === null || typeof val !== 'object') return null;
  const o = val as Record<string, unknown>;
  if (Number.isInteger(o.x) && Number.isInteger(o.y)) {
    return { x: o.x as number, y: o.y as number };
  }
  return null;
}

export async function hover(
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<ActionResponse> {
  if (!sessionId) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--session-id is required');
  }

  const selectorProvided = args.selector !== undefined;
  const coordsProvided = args.coords !== undefined;

  if (selectorProvided && coordsProvided) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--selector and --coords are mutually exclusive');
  }
  if (!selectorProvided && !coordsProvided) {
    throw new BrowserToolError('INVALID_ARGUMENTS', 'one of --selector or --coords is required');
  }

  if (selectorProvided) {
    if (typeof args.selector !== 'string' || args.selector === '') {
      throw new BrowserToolError('INVALID_ARGUMENTS', '--selector must be a non-empty string');
    }
    return manager.getSession(sessionId).hover(args.selector);
  }

  const coords = parseCoords(args.coords);
  if (!coords) {
    throw new BrowserToolError('INVALID_ARGUMENTS', '--coords must be an object with integer x and y fields');
  }
  return manager.getSession(sessionId).hover(undefined, coords);
}
