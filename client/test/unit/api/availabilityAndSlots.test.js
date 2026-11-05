// api/availability.js (MH-04) and api/slots.js (MH-02): each function calls its endpoint through apiFetch;
// with VITE_USE_MOCKS=true it answers from api/mocks/* (replaced here: the mocks are not tested, they will
// be removed). Also, for every api/* module: a mock is never loaded once VITE_USE_MOCKS is no longer 'true'.
// useMocks is read when the module loads: every test loads the modules again with vi.resetModules.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules();
  const [availability, slots] = await Promise.all([
    import('../../../src/api/availability.js'),
    import('../../../src/api/slots.js'),
  ]);
  return { ...availability, ...slots };
}

const reply = (status, data) => new Response(JSON.stringify(data), { status });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('../../../src/api/mocks/availability.js');
  vi.doUnmock('../../../src/api/mocks/slots.js');
});

describe('without mocks (VITE_USE_MOCKS=false)', () => {
  it('checkAvailability: GET /api/public/slots/:id/availability?partySize=', async () => {
    const answer = { available: true, split: [{ slotTableId: 9, tableName: 'T1', seats: 3 }] };
    const fetch = vi.fn().mockResolvedValue(reply(200, answer));
    vi.stubGlobal('fetch', fetch);
    const { checkAvailability } = await load(false);

    await expect(checkAvailability(5, 3)).resolves.toEqual(answer);
    expect(fetch.mock.calls[0][0]).toBe('/api/public/slots/5/availability?partySize=3');
    expect(fetch.mock.calls[0][1].method).toBeUndefined(); // GET
  });

  it('listSlots: GET /api/slots?from=&to=', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(200, []));
    vi.stubGlobal('fetch', fetch);
    const { listSlots } = await load(false);

    await expect(listSlots('2026-11-02', '2026-11-08')).resolves.toEqual([]);
    expect(fetch.mock.calls[0][0]).toBe('/api/slots?from=2026-11-02&to=2026-11-08');
  });

  it('createSlot: POST /api/slots with the slot as JSON', async () => {
    const slot = { date: '2026-11-05', startTime: '19:00', endTime: '20:30', label: 'Dinner', tables: [] };
    const fetch = vi.fn().mockResolvedValue(reply(201, { id: 1, ...slot }));
    vi.stubGlobal('fetch', fetch);
    const { createSlot } = await load(false);

    await expect(createSlot(slot)).resolves.toEqual({ id: 1, ...slot });
    expect(fetch).toHaveBeenCalledWith('/api/slots', expect.objectContaining({ method: 'POST', body: JSON.stringify(slot) }));
  });
});

describe('with mocks (VITE_USE_MOCKS=true)', () => {
  it('answers from the mocks, without any request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.doMock('../../../src/api/mocks/availability.js', () => ({
      checkAvailability: vi.fn(async (id, size) => ({ mock: 'availability', id, size })),
    }));
    vi.doMock('../../../src/api/mocks/slots.js', () => ({
      listSlots: vi.fn(async (from, to) => ({ mock: 'list', from, to })),
      createSlot: vi.fn(async (slot) => ({ mock: 'create', slot })),
    }));
    const { checkAvailability, listSlots, createSlot } = await load(true);

    await expect(checkAvailability(5, 3)).resolves.toEqual({ mock: 'availability', id: 5, size: 3 });
    await expect(listSlots('a', 'b')).resolves.toEqual({ mock: 'list', from: 'a', to: 'b' });
    await expect(createSlot({ label: 'X' })).resolves.toEqual({ mock: 'create', slot: { label: 'X' } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('every api module', () => {
  // Mock mode chosen when the module loaded, but VITE_USE_MOCKS no longer 'true' when it is called:
  // the mock is not loaded (the import() is dead code in a build without mocks).
  it.each([
    ['auth.js', (m) => m.me()],
    ['bookings.js', (m) => m.getBooking(1)],
    ['publicSlots.js', (m) => m.listPublicSlots('2026-11-05')],
    ['availability.js', (m) => m.checkAvailability(1, 2)],
    ['slots.js', (m) => m.listSlots('2026-11-02', '2026-11-08')],
  ])('%s never loads a mock when VITE_USE_MOCKS is not "true"', async (file, call) => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.resetModules();
    const module = await import(`../../../src/api/${file}`);
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    await expect(call(module)).rejects.toThrow('Mocks are off');
  });
});
