// /api/staff/hikes – hikes seen by the staff (openapi.yaml tag staff): the hikers on a hike now (MH-21 BE1).
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listActiveHikes } from '../services/hikeService.js';

const router = Router();

// GET /api/staff/hikes/active → 200 [ActiveHike] | 401 | 403 (hikers)
// Hikes in progress, also after their expected return, with the hiker's contact details; earliest expected return first.
router.get('/active', requireRole(['employee'], 'Staff only'), async (req, res) => {
  res.json(await listActiveHikes());
});

export default router;
