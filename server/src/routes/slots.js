// /api/slots – (MH-02) list and create slots with their tables, (MH-09) copy a week (employee, warden)
import { Router } from 'express';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { requireRole } from '../middleware/auth.js';
import { BadRequest } from '../errors.js';
import { copyWeek, createSlot, hasStarted } from '../services/slotService.js';

const router = Router();

// Duplicated from routes/publicSlots.js (MH-01), can be moved to a common file when it is merged.
const isValidDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const isValidTime = (time) => {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return hours < 24 && minutes < 60;
};

function validateDateRange(from, to) {
  if (!isValidDate(from)) throw new BadRequest('from must be a valid calendar date');
  if (!isValidDate(to)) throw new BadRequest('to must be a valid calendar date');
  if (to < from) throw new BadRequest('to must be on or after from');

  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 31) throw new BadRequest('The range cannot exceed 31 days');
}

function validateNewSlotBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequest('Slot details are required');
  }
  if (!isValidDate(body.date)) throw new BadRequest('date must be a valid calendar date');
  if (!isValidTime(body.startTime) || !isValidTime(body.endTime)) {
    throw new BadRequest('startTime and endTime must be valid times');
  }
  if (typeof body.label !== 'string' || body.label.trim() === '') {
    throw new BadRequest('label is required');
  }
}

function naturalTableOrder(tables) {
  return [...tables].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }) || left.id - right.id,
  );
}

function slotResponse(slot) {
  return {
    ...slot,
    past: hasStarted(slot),
    tables: naturalTableOrder(slot.tables),
  };
}

// GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD → 200 [Slot] | 400
// Employee/warden only; inclusive range up to 31 days, ordered by date/start time and natural table name.
router.get('/', requireRole(['employee'], 'Staff only'), async (req, res) => {
  const { from, to } = req.query;
  validateDateRange(from, to);

  const slots = await slotDao.findInRange(await getDb(), from, to);
  return res.json(slots.map(slotResponse));
});

// POST /api/slots { date, startTime, endTime, label, tables } → 201 Slot | 400 | 409
// Employee/warden only; creates a slot with tables
router.post('/', requireRole(['employee'], 'Staff only'), async (req, res) => {
  validateNewSlotBody(req.body);

  const slot = await createSlot(req.body);
  return res.status(201).json(slotResponse(slot));
});

// POST /api/slots/copy-week { sourceWeek, targetWeek }
//   → 201 { created: [Slot], replaced: [Slot], skipped: [{ date, startTime, endTime, label, reason }] }
//   | 400 (invalid dates, same week) | 401 | 403 | 409 (the target week has bookings)
// Employee/warden only (MH-09); sourceWeek and targetWeek are any date of the two weeks.
router.post('/copy-week', requireRole(['employee'], 'Staff only'), async (req, res) => {
  const { sourceWeek, targetWeek } = req.body ?? {};
  if (!isValidDate(sourceWeek)) throw new BadRequest('sourceWeek must be a valid calendar date');
  if (!isValidDate(targetWeek)) throw new BadRequest('targetWeek must be a valid calendar date');

  const { created, replaced, skipped } = await copyWeek(sourceWeek, targetWeek);
  return res.status(201).json({ created: created.map(slotResponse), replaced: replaced.map(slotResponse), skipped });
});

export default router;
