// /api/bookings – create a booking, get a booking (MH-01 BE2, openapi.yaml tag bookings); both answers include
// the party requirements (MH-05). The hiker's own list (MH-06 BE1), the change of a booking (MH-06 BE2) and its
// cancellation (MH-08 BE1).
import { Router } from 'express';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import { BadRequest, NotFound } from '../errors.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import * as bookingService from '../services/bookingService.js';
import { cancelBooking } from '../services/cancelBookingService.js';
import { changeBooking, listMyBookings } from '../services/myBookingsService.js';

const router = Router();

// GET /api/bookings → 200 [MyBooking] | 401 | 403 (staff: they have no bookings of their own)
// The logged-in hiker's bookings, confirmed and cancelled, upcoming first, each with `changeable` (MH-06).
router.get('/', requireRole(['hiker'], 'Only hikers have bookings'), async (req, res) => {
  res.json(await listMyBookings(req.user));
});

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

// PATCH /api/bookings/:id {slotId?, partySize?, requirements?} → 200 Booking | 400 | 401 | 404 | 409
// Owner only: anyone else (staff included) gets 404, as for GET. The rules are in myBookingsService.js.
router.patch('/:id', requireLogin, async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) throw new BadRequest('id must be a positive integer');
  res.json(await changeBooking(req.user, Number(req.params.id), req.body));
});

// POST /api/bookings/:id/cancel → 200 Booking (status cancelled) | 400 | 401 | 404 | 409 already cancelled (MH-08)
// Owner only, at any time: anyone else (staff included) gets 404, as for GET. A POST, not DELETE: the booking stays.
router.post('/:id/cancel', requireLogin, async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) throw new BadRequest('id must be a positive integer');
  res.json(await cancelBooking(req.user, Number(req.params.id)));
});

export default router;
