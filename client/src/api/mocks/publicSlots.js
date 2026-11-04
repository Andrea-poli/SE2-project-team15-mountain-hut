// Mock of GET /api/public/slots (VITE_USE_MOCKS=true): same answers and errors as the contract,
// no server needed. Only loaded through a dynamic import in api/publicSlots.js.
// TODO: remove when MH-01 BE2 (GET /api/public/slots) is on dev, together with all mocks if the team drops mock mode.
import { ApiError } from '../client.js';

const DELAY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Every day: lunch and two dinner turns, as in the openapi example. Mondays: no meal service.
const DAY_SLOTS = [
  { label: 'Lunch', startTime: '12:00', endTime: '14:00' },
  { label: 'Dinner - 1st turn', startTime: '19:00', endTime: '20:30' },
  { label: 'Dinner - 2nd turn', startTime: '21:00', endTime: '22:30' },
];
const MONDAY = 1;
const BOOKING_DEADLINE_MS = 2 * 60 * 60 * 1000; // closed less than 2 h before the start (PO, MH-01)

function parseDate(value) {
  const match = DATE_RE.exec(value ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? { year, month, day, weekday: date.getDay() } : null;
}

export async function listPublicSlots(date) {
  await wait();
  const parsed = parseDate(date);
  if (!parsed) throw new ApiError(400, 'date must be YYYY-MM-DD');
  if (parsed.weekday === MONDAY) return [];

  const now = Date.now();
  // Stable ids per day, so a slotId in the URL points to the same slot after a reload.
  const base = (parsed.year * 10000 + parsed.month * 100 + parsed.day) * 10;
  return DAY_SLOTS.map((slot, index) => {
    const [hours, minutes] = slot.startTime.split(':').map(Number);
    const start = new Date(parsed.year, parsed.month - 1, parsed.day, hours, minutes).getTime();
    let bookingState = 'bookable';
    if (start - now < BOOKING_DEADLINE_MS) bookingState = 'tooLate';
    // The 1st dinner turn is full on even days, so the "full" case can be tried.
    else if (index === 1 && parsed.day % 2 === 0) bookingState = 'full';
    return { id: base + index + 1, ...slot, bookingState };
  });
}
