// /api/public/slots/:id/availability – is there room for a party in one slot, and how would they sit
// (MH-04 BE1, openapi.yaml checkAvailability). Public: no login. Same rules as the booking (allocate,
// bookingClosed), so the check and the booking always agree. A closed slot, or one that started or starts
// within 2 h, answers 200 { available: false }, never an error: the client shows it in place of the result.
import { Router } from 'express';
import { now } from '../clock.js';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { BadRequest, NotFound } from '../errors.js';
import { allocate, bookingClosed } from '../services/availability.js';

const router = Router({ mergeParams: true });

const NOT_AVAILABLE = { available: false, split: [] };

/** Positive integer written in decimal: '3' yes; '0', '-1', '1.5', 'abc', '', an array (repeated param), a number too big to be exact no. */
const isPositiveInteger = (value) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));

/** allocate's [{ slotTableId, seats }] with the table names, as the Allocation schema wants. */
function withTableNames(split, tables) {
  const names = new Map(tables.map(({ id, name }) => [id, name]));
  return split.map(({ slotTableId, seats }) => ({ slotTableId, tableName: names.get(slotTableId), seats }));
}

// GET /api/public/slots/:id/availability?partySize=N → 200 Availability | 400 id/partySize | 404 slot
router.get('/', async (req, res) => {
  if (!isPositiveInteger(req.params.id)) throw new BadRequest('id must be a positive integer');
  if (!isPositiveInteger(req.query.partySize)) throw new BadRequest('partySize must be a positive integer');

  const db = await getDb();
  const slot = await slotDao.findById(db, Number(req.params.id));
  if (!slot) throw new NotFound('Slot not found');
  if (slot.status !== 'open' || bookingClosed(slot, now())) return res.json(NOT_AVAILABLE);

  const split = allocate(slot.tables, await bookingDao.allocationsForSlot(db, slot.id), Number(req.query.partySize));
  res.json(split ? { available: true, split: withTableNames(split, slot.tables) } : NOT_AVAILABLE);
});

export default router;
