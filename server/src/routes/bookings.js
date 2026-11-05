// /api/bookings – create a booking, get a booking (MH-01 BE2, openapi.yaml tag bookings)
import { Router } from 'express';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import { BadRequest, NotFound } from '../errors.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import * as bookingService from '../services/bookingService.js';

const router = Router();

// POST /api/bookings {slotId, partySize} → 201 Booking + Location | 400 | 401 | 403 | 404 slot | 409
router.post('/', requireRole(['hiker'], 'Only hikers can book'), async (req, res) => {
  const booking = await bookingService.createBooking(req.user, req.body);
  res.status(201).location(`/api/bookings/${booking.id}`).json(booking);
});

// GET /api/bookings/:id → 200 Booking | 400 | 401 | 404 (also someone else's booking, staff included:
// the answer does not reveal that it exists)
router.get('/:id', requireLogin, async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) throw new BadRequest('id must be a positive integer');
  const found = await bookingDao.findById(await getDb(), Number(req.params.id));
  if (!found || found.hikerId !== req.user.id) throw new NotFound('Booking not found');
  const { hikerId: _hikerId, ...booking } = found;
  res.json(booking);
});

export default router;
