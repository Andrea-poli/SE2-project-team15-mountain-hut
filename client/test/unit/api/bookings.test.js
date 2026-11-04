// api/bookings.js and api/publicSlots.js: each function calls its endpoint through apiFetch.
// With VITE_USE_MOCKS=true they answer from api/mocks/* instead: the mock modules are replaced here
// (they are tested nowhere, they will be removed), the test only checks that no request is sent.
// useMocks is read when the module loads: every test loads it again with vi.resetModules.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules();
  const [bookings, publicSlots, client] = await Promise.all([
    import('../../../src/api/bookings.js'),
    import('../../../src/api/publicSlots.js'),
    import('../../../src/api/client.js'),
  ]);
  return { ...bookings, ...publicSlots, ApiError: client.ApiError };
}

const reply = (status, data) => new Response(JSON.stringify(data), { status });

const slots = [{ id: 4, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' }];
const booking = {
  id: 7,
  slot: { id: 4, date: '2026-11-06', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
  partySize: 3,
  tables: [{ slotTableId: 9, tableName: 'T1', seats: 3 }],
  status: 'confirmed',
  createdAt: '2026-11-02T09:00:00.000Z',
};

describe('api/bookings and api/publicSlots', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock('../../../src/api/mocks/bookings.js');
    vi.doUnmock('../../../src/api/mocks/publicSlots.js');
  });

  describe('without mocks (VITE_USE_MOCKS=false)', () => {
    it('listPublicSlots gets the slots of one day', async () => {
      const fetch = vi.fn().mockResolvedValue(reply(200, slots));
      vi.stubGlobal('fetch', fetch);
      const api = await load(false);
      await expect(api.listPublicSlots('2026-11-03')).resolves.toEqual(slots);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.lastCall[0]).toBe('/api/public/slots?date=2026-11-03');
      expect(fetch.mock.lastCall[1].method).toBeUndefined(); // GET
    });

    it('createBooking posts slotId and partySize as JSON', async () => {
      const fetch = vi.fn().mockResolvedValue(reply(201, booking));
      vi.stubGlobal('fetch', fetch);
      const api = await load(false);
      await expect(api.createBooking({ slotId: 4, partySize: 3 })).resolves.toEqual(booking);
      const [path, init] = fetch.mock.lastCall;
      expect(path).toBe('/api/bookings');
      expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
      expect(JSON.parse(init.body)).toEqual({ slotId: 4, partySize: 3 });
    });

    it('getBooking gets one booking, with the id encoded in the path', async () => {
      const fetch = vi.fn().mockImplementation(async () => reply(200, booking));
      vi.stubGlobal('fetch', fetch);
      const api = await load(false);
      await expect(api.getBooking(7)).resolves.toEqual(booking);
      expect(fetch.mock.lastCall[0]).toBe('/api/bookings/7');
      expect(fetch.mock.lastCall[1].method).toBeUndefined(); // GET
      await api.getBooking('1/../2?x=#');
      expect(fetch.mock.lastCall[0]).toBe('/api/bookings/1%2F..%2F2%3Fx%3D%23');
    });

    it('the date is encoded in the query', async () => {
      const fetch = vi.fn().mockImplementation(async () => reply(200, []));
      vi.stubGlobal('fetch', fetch);
      const api = await load(false);
      await api.listPublicSlots('2026-11-03&x=1');
      expect(fetch.mock.lastCall[0]).toBe('/api/public/slots?date=2026-11-03%26x%3D1');
    });

    it('passes on the server errors as ApiError with status and message', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(reply(409, { error: 'Not enough seats available for this party' }))
          .mockResolvedValueOnce(reply(404, { error: 'Booking not found' }))
          .mockResolvedValueOnce(reply(400, { error: 'date must be YYYY-MM-DD' })),
      );
      const api = await load(false);

      const conflict = await api.createBooking({ slotId: 4, partySize: 30 }).catch((e) => e);
      expect(conflict).toBeInstanceOf(api.ApiError);
      expect(conflict).toMatchObject({ status: 409, message: 'Not enough seats available for this party' });
      await expect(api.getBooking(99)).rejects.toMatchObject({ name: 'ApiError', status: 404, message: 'Booking not found' });
      await expect(api.listPublicSlots('x')).rejects.toMatchObject({ status: 400, message: 'date must be YYYY-MM-DD' });
    });
  });

  describe('with mocks (VITE_USE_MOCKS=true)', () => {
    it('answers from the mock modules, without any request to the server', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const mockBookings = { createBooking: vi.fn().mockResolvedValue(booking), getBooking: vi.fn().mockResolvedValue(booking) };
      const mockSlots = { listPublicSlots: vi.fn().mockResolvedValue(slots) };
      vi.doMock('../../../src/api/mocks/bookings.js', () => mockBookings);
      vi.doMock('../../../src/api/mocks/publicSlots.js', () => mockSlots);
      const api = await load(true);

      await expect(api.createBooking({ slotId: 4, partySize: 3 })).resolves.toEqual(booking);
      expect(mockBookings.createBooking).toHaveBeenCalledWith({ slotId: 4, partySize: 3 });
      await expect(api.getBooking('7')).resolves.toEqual(booking);
      expect(mockBookings.getBooking).toHaveBeenCalledWith('7');
      await expect(api.listPublicSlots('2026-11-03')).resolves.toEqual(slots);
      expect(mockSlots.listPublicSlots).toHaveBeenCalledWith('2026-11-03');
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
