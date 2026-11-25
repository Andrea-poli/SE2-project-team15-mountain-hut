// MH-11 BE1 – meal times and menus for the public meals page.
// Every open slot of the range with its times, label, `past` and menu (MH-10, null when not written yet).
// No seat counts and no tables: the booking page says whether a slot can still be booked (openapi: Meal).
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { hasStarted } from './slotService.js';

/**
 * @param {string} from first date, 'YYYY-MM-DD' (already validated by the route)
 * @param {string} to last date, 'YYYY-MM-DD' (inclusive)
 * @returns {Promise<{ id: number, date: string, startTime: string, endTime: string, label: string,
 *   past: boolean, menu: string | null }[]>} ordered by date, then start time (slotDao order)
 */
export async function listMeals(from, to) {
  const slots = await slotDao.findInRange(await getDb(), from, to);
  return slots
    .filter((slot) => slot.status === 'open')
    .map(({ id, date, startTime, endTime, label, menu }) => ({
      id,
      date,
      startTime,
      endTime,
      label,
      past: hasStarted({ date, startTime }),
      menu: menu ?? null,
    }));
}
