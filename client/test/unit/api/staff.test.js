// MH-07 FT1 – api/staff.js, from the contract (openapi searchHikers, createStaffBooking): each function calls
// its endpoint through apiFetch; with VITE_USE_MOCKS=true it answers from api/mocks/staff.js (replaced here,
// as in bookings.test.js) and sends no request. useMocks is read when the module loads: vi.resetModules.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules();
  const [staff, client] = await Promise.all([
    import('../../../src/api/staff.js'),
    import('../../../src/api/client.js'),
  ]);
  return { ...staff, ApiError: client.ApiError };
}

const reply = (status, data) => new Response(JSON.stringify(data), { status });

const MARCO = { id: 4, firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com',
  phone: '+39 333 1234567', temporary: false };
const STAFF_BOOKING = {
  id: 101,
  slot: { id: 3, date: '2026-11-06', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
  partySize: 2,
  tables: [{ slotTableId: 9, tableName: 'T1', seats: 2 }],
  requirements: [],
  status: 'confirmed',
  createdAt: '2026-11-02T09:00:00.000Z',
  hiker: MARCO,
};

describe('api/staff', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock('../../../src/api/mocks/staff.js');
  });

  describe('without mocks (VITE_USE_MOCKS=false)', () => {
    it('searchHikers gets GET /api/staff/hikers with q encoded', async () => {
      const fetch = vi.fn().mockImplementation(async () => reply(200, [MARCO]));
      vi.stubGlobal('fetch', fetch);
      const api = await load(false);
      await expect(api.searchHikers('rossi')).resolves.toEqual([MARCO]);
      expect(fetch.mock.lastCall[0]).toBe('/api/staff/hikers?q=rossi');
      expect(fetch.mock.lastCall[1].method).toBeUndefined(); // GET

      await api.searchHikers('+39 333&x=1');
      expect(fetch.mock.lastCall[0]).toBe('/api/staff/hikers?q=%2B39%20333%26x%3D1');
    });

    it('createStaffBooking posts the body as JSON to /api/staff/bookings', async () => {
      const fetch = vi.fn().mockResolvedValue(reply(201, { ...STAFF_BOOKING, generatedPassword: 'k7Qp2xWm9aTz' }));
      vi.stubGlobal('fetch', fetch);
      const api = await load(false);
      const body = {
        newHiker: { firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com', phone: '+393335551234' },
        slotId: 3,
        partySize: 2,
      };
      await expect(api.createStaffBooking(body)).resolves.toMatchObject({ generatedPassword: 'k7Qp2xWm9aTz' });
      const [path, init] = fetch.mock.lastCall;
      expect(path).toBe('/api/staff/bookings');
      expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
      expect(JSON.parse(init.body)).toEqual(body);
    });

    it('passes on the server refusals as ApiError with status and message', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(reply(400, { error: 'Type at least 2 characters to search' }))
          .mockResolvedValueOnce(reply(403, { error: 'Staff only' }))
          .mockResolvedValueOnce(reply(409, { error: 'Email already in use' }))
          .mockResolvedValueOnce(reply(404, { error: 'Hiker not found' })),
      );
      const api = await load(false);
      const short = await api.searchHikers('r').catch((e) => e);
      expect(short).toBeInstanceOf(api.ApiError);
      expect(short).toMatchObject({ status: 400, message: 'Type at least 2 characters to search' });
      await expect(api.searchHikers('rossi')).rejects.toMatchObject({ status: 403, message: 'Staff only' });
      await expect(api.createStaffBooking({ slotId: 3, partySize: 2 })).rejects.toMatchObject({
        status: 409, message: 'Email already in use',
      });
      await expect(api.createStaffBooking({ hikerId: 99, slotId: 3, partySize: 2 })).rejects.toMatchObject({
        status: 404, message: 'Hiker not found',
      });
    });
  });

  describe('with mocks (VITE_USE_MOCKS=true)', () => {
    it('answers from the mock module, without any request to the server', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const mockStaff = {
        searchHikers: vi.fn().mockResolvedValue([MARCO]),
        createStaffBooking: vi.fn().mockResolvedValue(STAFF_BOOKING),
      };
      vi.doMock('../../../src/api/mocks/staff.js', () => mockStaff);
      const api = await load(true);

      await expect(api.searchHikers('rossi')).resolves.toEqual([MARCO]);
      expect(mockStaff.searchHikers).toHaveBeenCalledWith('rossi');
      const body = { hikerId: 4, slotId: 3, partySize: 2 };
      await expect(api.createStaffBooking(body)).resolves.toEqual(STAFF_BOOKING);
      expect(mockStaff.createStaffBooking).toHaveBeenCalledWith(body);
      expect(fetch).not.toHaveBeenCalled();
    });

    // Mock mode chosen when the module loaded, but VITE_USE_MOCKS no longer 'true' when it is called: the mock
    // is not loaded (the import() is dead code in a build without mocks), as for the other api modules.
    it.each([
      ['searchHikers', (m) => m.searchHikers('rossi')],
      ['createStaffBooking', (m) => m.createStaffBooking({ hikerId: 4, slotId: 3, partySize: 2 })],
    ])('%s never loads the mock when VITE_USE_MOCKS is not "true"', async (_name, call) => {
      const module = await load(true);
      vi.stubEnv('VITE_USE_MOCKS', 'false');
      await expect(call(module)).rejects.toThrow('Mocks are off');
    });
  });
});
