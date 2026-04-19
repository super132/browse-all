import { BrowserToolError } from '../errors';
import type { SessionManager } from '../session/SessionManager';
import type { CommandResponse } from '../types';
import { start } from './start';
import { navigate } from './navigate';
import { read } from './read';
import { click } from './click';
import { typeText } from './type';
import { scroll } from './scroll';
import { hover } from './hover';
import { upload } from './upload';
import { download } from './download';
import { wait } from './wait';
import { close } from './close';

export type CommandHandler = (
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
) => Promise<CommandResponse>;

const HANDLERS: Record<string, CommandHandler> = {
  start,
  navigate,
  read,
  click,
  type: typeText,
  scroll,
  hover,
  upload,
  download,
  wait,
  close,
};

export async function dispatch(
  command: string,
  sessionId: string | undefined,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<CommandResponse> {
  const handler = HANDLERS[command];
  if (!handler) {
    throw new BrowserToolError('INVALID_ARGUMENTS', `Unknown command: ${command}`);
  }
  return handler(sessionId, args, manager);
}
