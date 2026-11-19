// /api/staff/bookings - book a slot for an existing, new, or temporary hiker (MH-07).
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { createStaffBooking } from '../services/staffBookingService.js';

const router = Router();

router.post('/', requireRole(['employee'], 'Staff only'), async (req, res) => {
  const booking = await createStaffBooking(req.body);
  return res.status(201).location(`/api/bookings/${booking.id}`).json(booking);
});

export default router;
