import type { BrowserSession } from '../../session/BrowserSession';
import type { SessionManager } from '../../session/SessionManager';
import { wait } from '../../commands/wait';

function makeSession(): BrowserSession {
  return {
    id: 'sess-1',
    wait: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'wait', target: '#el' }),
  } as unknown as BrowserSession;
}

function makeManager(session: BrowserSession): SessionManager {
  return { getSession: jest.fn().mockReturnValue(session) } as unknown as SessionManager;
}

describe('wait handler', () => {
  it('calls session.wait with selector and timeout', async () => {
    const session = makeSession();
    await wait('sess-1', { selector: '#el', timeout: 5000 }, makeManager(session));
    expect(session.wait).toHaveBeenCalledWith('#el', 5000);
  });

  it('defaults timeout to 30000 when omitted', async () => {
    const session = makeSession();
    await wait('sess-1', { selector: '#el' }, makeManager(session));
    expect(session.wait).toHaveBeenCalledWith('#el', 30_000);
  });

  it('throws INVALID_ARGUMENTS for non-integer timeout', async () => {
    await expect(
      wait('sess-1', { selector: '#el', timeout: 1.5 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS for zero timeout', async () => {
    await expect(
      wait('sess-1', { selector: '#el', timeout: 0 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS for negative timeout', async () => {
    await expect(
      wait('sess-1', { selector: '#el', timeout: -1 }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when selector is missing', async () => {
    await expect(wait('sess-1', {}, makeManager(makeSession()))).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    await expect(wait(undefined, { selector: '#el' }, makeManager(makeSession()))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  });
});
