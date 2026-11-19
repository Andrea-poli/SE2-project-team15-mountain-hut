// /api/staff/hikers - search hikers for staff (MH-07).
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { searchHikers } from '../services/staffHikerService.js';

const router = Router();

// GET /api/staff/hikers?q=... - search hikers for the staff panel (MH-07).
router.get('/', requireRole(['employee'], 'Staff only'), async (req, res) => {
  return res.json(await searchHikers(req.query.q));
});

export default router;
