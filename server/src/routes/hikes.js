// /api/hikes – hikes registered by hikers (openapi.yaml tag hikes): register a hike (MH-20 BE1).
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { registerHike } from '../services/hikeService.js';

const router = Router();

// POST /api/hikes {destination, route, passagePoints?, departureAt, expectedReturnAt} → 201 Hike | 400 | 401 | 403
// Hikers only (staff have no hikes of their own). No Location header (openapi.yaml).
router.post('/', requireRole(['hiker'], 'Only hikers can register a hike'), async (req, res) => {
  res.status(201).json(await registerHike(req.user, req.body));
});

export default router;
