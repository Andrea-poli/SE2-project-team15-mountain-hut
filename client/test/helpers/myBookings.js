// Bookings of a hiker as GET /api/bookings returns them (openapi MyBooking), shared by the tests of My bookings
// (MH-06 FT1: MyBookingsPages.test.jsx, MH-08 FT1: CancelBooking.test.jsx). "Now" is NOW: Tue 3 Nov 2026, 10:00.
export const NOW = new Date(2026, 10, 3, 10, 0);

/** A confirmed, changeable booking of a lunch a week ahead; `over` replaces any field. */
export const booking = (over) => ({
  id: 7,
  slot: { id: 10, date: '2026-11-10', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
  partySize: 3,
  tables: [{ slotTableId: 1, tableName: 'T1', seats: 2 }, { slotTableId: 2, tableName: 'T2', seats: 1 }],
  requirements: [],
  status: 'confirmed',
  createdAt: '2026-10-30T09:00:00Z',
  changeable: true,
  ...over,
});
/** Tue 10 Nov, with requirements (one with allergies). */
export const UPCOMING = booking({
  requirements: [
    { hasAllergies: true, description: '1 shellfish allergy' },
    { hasAllergies: false, description: '2 vegetarians' },
  ],
});
/** Wed 4 Nov dinner: less than 48 h away, so not changeable. */
export const SOON = booking({
  id: 8, changeable: false,
  slot: { id: 11, date: '2026-11-04', startTime: '19:00', endTime: '20:30', label: 'Dinner – 1st turn' },
});
export const CANCELLED = booking({ id: 9, status: 'cancelled', changeable: false, tables: [] });
/** Wed 28 Oct: already past. */
export const PAST = booking({
  id: 6, changeable: false, slot: { id: 5, date: '2026-10-28', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
});
