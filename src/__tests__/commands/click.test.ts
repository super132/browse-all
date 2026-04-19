import type { BrowserSession } from '../../session/BrowserSession';
import type { SessionManager } from '../../session/SessionManager';
import { click } from '../../commands/click';

function makeSession(): BrowserSession {
  return {
    id: 'sess-1',
    click: jest.fn().mockResolvedValue({ sessionId: 'sess-1', action: 'click', target: '#btn' }),
  } as unknown as BrowserSession;
}

function makeManager(session: BrowserSession): SessionManager {
  return {
    getSession: jest.fn().mockReturnValue(session),
  } as unknown as SessionManager;
}

describe('click handler', () => {
  it('calls session.click with selector', async () => {
    const session = makeSession();
    await click('sess-1', { selector: '#btn' }, makeManager(session));
    expect(session.click).toHaveBeenCalledWith('#btn');
  });

  it('calls session.click with coords', async () => {
    const session = makeSession();
    await click('sess-1', { coords: { x: 100, y: 200 } }, makeManager(session));
    expect(session.click).toHaveBeenCalledWith(undefined, { x: 100, y: 200 });
  });

  it('throws INVALID_ARGUMENTS when neither --selector nor --coords is provided', async () => {
    await expect(click('sess-1', {}, makeManager(makeSession()))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  });

  it('throws INVALID_ARGUMENTS when both --selector and --coords are provided', async () => {
    await expect(
      click('sess-1', { selector: '#btn', coords: { x: 1, y: 2 } }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when --selector is an empty string', async () => {
    await expect(
      click('sess-1', { selector: '' }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when --coords has non-integer values', async () => {
    await expect(
      click('sess-1', { coords: { x: 1.5, y: 2 } }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when --coords is not an object', async () => {
    await expect(
      click('sess-1', { coords: '100,200' }, makeManager(makeSession())),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('throws INVALID_ARGUMENTS when sessionId is missing', async () => {
    await expect(click(undefined, { selector: '#btn' }, makeManager(makeSession()))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  });
});
