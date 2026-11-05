// /api/public/slots – the open slots of a day, for the SlotPicker (MH-01 BE2, shared with MH-04).
// Public: no login. Seat counts are never shown, only bookingState.
import { Router } from 'express';
import { now } from '../clock.js';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { BadRequest } from '../errors.js';
import { bookingClosed, freeSeats } from '../services/availability.js';

const router = Router();

/** 'YYYY-MM-DD' that exists on the calendar (2026-02-30 does not). */
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** tooLate (started or less than 2 h before the start) wins over full: the slot cannot be booked anyway. */
async function bookingState(db, slot, at) {
  if (bookingClosed(slot, at)) return 'tooLate';
  const free = freeSeats(slot.tables, await bookingDao.allocationsForSlot(db, slot.id));
  return free === 0 ? 'full' : 'bookable';
}

// GET /api/public/slots?date=YYYY-MM-DD → 200 [{ id, label, startTime, endTime, bookingState }] | 400
// Every open slot of the day, ordered by start time; closed slots are not listed.
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!isValidDate(date)) throw new BadRequest('date must be YYYY-MM-DD');

  const db = await getDb();
  const at = now();
  const slots = (await slotDao.findByDate(db, date)).filter((slot) => slot.status === 'open');
  const result = [];
  for (const slot of slots) {
    const { id, label, startTime, endTime } = slot;
    result.push({ id, label, startTime, endTime, bookingState: await bookingState(db, slot, at) });
  }
  res.json(result);
});

export default router;
