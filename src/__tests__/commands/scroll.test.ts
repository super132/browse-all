import type { BrowserSession } from '../../session/BrowserSession';
import type { SessionManager } from '../../session/SessionManager';
import { scroll } from '../../commands/scroll';

function makeSession(): BrowserSession {
  return {
    id: 'sess-1',
    scroll: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'scroll', target: 'window', direction: 'down', amount: 500 }),
  } as unknown as BrowserSession;
}

function makeManager(session: BrowserSession): SessionManager {
  return { getSession: jest.fn().mockReturnValue(session) } as unknown as SessionManager;
}

describe('scroll handler', () => {
  it('calls session.scroll with direction and amount', async () => {
    const session = makeSession();
    await scroll('sess-1', { direction: 'down', amount: 300 }, makeManager(session));
    expect(session.scroll).toHaveBeenCalledWith('down', 300);
  });

  it('defaults amount to 500 when omitted', async () => {
    const session = makeSession();
    await scroll('sess-1', { direction: 'up' }, makeManager(session));
    expect(session.scroll).toHaveBeenCalledWith('up', 500);
  });

  it('throws INVALID_ARGUMENTS for non-integer amount', async () => {
    await expect(
      scroll('sess-1', { direction: 'down', amount: 1.5 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS for zero amount', async () => {
    await expect(
      scroll('sess-1', { direction: 'down', amount: 0 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS for negative amount', async () => {
    await expect(
      scroll('sess-1', { direction: 'down', amount: -100 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS for invalid direction', async () => {
    await expect(
      scroll('sess-1', { direction: 'left', amount: 100 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    await expect(scroll(undefined, { direction: 'down' }, makeManager(makeSession()))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  });
});
