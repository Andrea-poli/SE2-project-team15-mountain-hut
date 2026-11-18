// /api/bookings – create a booking, get a booking (MH-01 BE2, openapi.yaml tag bookings); both answers include
// the party requirements (MH-05)
import { Router } from 'express';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import { BadRequest, NotFound } from '../errors.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import * as bookingService from '../services/bookingService.js';
import { cancelBooking } from '../services/cancelBookingService.js';

const router = Router();

// POST /api/bookings {slotId, partySize, requirements?} → 201 Booking + Location | 400 | 401 | 403 | 404 slot | 409
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

// POST /api/bookings/:id/cancel → 200 Booking (status cancelled) | 400 | 401 | 404 | 409 already cancelled (MH-08)
// Owner only, at any time: anyone else (staff included) gets 404, as for GET. A POST, not DELETE: the booking stays.
router.post('/:id/cancel', requireLogin, async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) throw new BadRequest('id must be a positive integer');
  res.json(await cancelBooking(req.user, Number(req.params.id)));
});

export default router;
