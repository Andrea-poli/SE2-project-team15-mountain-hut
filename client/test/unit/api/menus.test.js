// MH-10 FT1 – api/slots.js setSlotMenu() and listPreviousMenus() (task MH-10 FE1/FE2), from docs/openapi.yaml:
//  PUT /api/slots/{id}/menu with { menu } (a text, or null to clear it), answering the Slot;
//  GET /api/slots/menus, with ?q= only when the text is not blank (trimmed, encoded).
// With VITE_USE_MOCKS=true both answer from the mock. useMocks is read when the module loads, so every test loads it
// again with vi.resetModules.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules();
  return import('../../../src/api/slots.js');
}

const reply = (status, data) => new Response(JSON.stringify(data), { status });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('../../../src/api/mocks/slots.js');
});

describe('setSlotMenu', () => {
  it.each([
    ['a text', '**Polenta**\n- Soup'],
    ['null (clears the menu)', null],
  ])('PUT /api/slots/{id}/menu with { menu }: %s, answering the Slot', async (_case, menu) => {
    const answer = { id: 5, menu };
    const fetch = vi.fn().mockResolvedValue(reply(200, answer));
    vi.stubGlobal('fetch', fetch);
    const { setSlotMenu } = await load(false);

    await expect(setSlotMenu(5, menu)).resolves.toEqual(answer);
    expect(fetch).toHaveBeenCalledWith(
      '/api/slots/5/menu',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ menu }) }),
    );
  });

  it('an error is thrown as an ApiError with the server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(404, { error: 'Slot not found' })));
    const { setSlotMenu } = await load(false);

    await expect(setSlotMenu(99, 'Soup')).rejects.toMatchObject({ status: 404, message: 'Slot not found' });
  });
});

describe('listPreviousMenus', () => {
  async function urlFor(...args) {
    const fetch = vi.fn().mockResolvedValue(reply(200, []));
    vi.stubGlobal('fetch', fetch);
    const { listPreviousMenus } = await load(false);
    await expect(listPreviousMenus(...args)).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    return fetch.mock.calls[0][0];
  }

  it('without q: GET /api/slots/menus, no query string', async () => {
    expect(await urlFor()).toBe('/api/slots/menus');
  });

  it.each(['', '   '])('a blank q (%j) sends no query string', async (q) => {
    expect(await urlFor(q)).toBe('/api/slots/menus');
  });

  it('q is trimmed and encoded', async () => {
    const url = await urlFor('  polenta & funghi?  ');
    expect(url).toMatch(/^\/api\/slots\/menus\?q=/);
    expect(new URLSearchParams(url.split('?')[1]).get('q')).toBe('polenta & funghi?');
    expect(url).not.toMatch(/ |&funghi/); // no raw space, the "&" is not a second parameter
  });

  it('answers the PreviousMenu list of the server', async () => {
    const answer = [{ menu: 'Soup', slotId: 2, date: '2026-11-03', startTime: '12:00', label: 'Lunch' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, answer)));
    const { listPreviousMenus } = await load(false);

    await expect(listPreviousMenus('soup')).resolves.toEqual(answer);
  });
});

describe('with VITE_USE_MOCKS=true', () => {
  it('both answer from the mock, without any request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.doMock('../../../src/api/mocks/slots.js', () => ({
      setSlotMenu: vi.fn(async (id, menu) => ({ mock: 'menu', id, menu })),
      listPreviousMenus: vi.fn(async (q) => [{ mock: 'menus', q }]),
    }));
    const { setSlotMenu, listPreviousMenus } = await load(true);

    await expect(setSlotMenu(5, 'Soup')).resolves.toEqual({ mock: 'menu', id: 5, menu: 'Soup' });
    await expect(listPreviousMenus('pol')).resolves.toEqual([{ mock: 'menus', q: 'pol' }]);
    await expect(listPreviousMenus()).resolves.toEqual([{ mock: 'menus', q: '' }]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
