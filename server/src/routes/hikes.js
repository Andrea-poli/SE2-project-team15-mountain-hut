// /api/hikes – hikes registered by hikers (openapi.yaml tag hikes): register a hike (MH-20 BE1), the hiker's own
// hikes (MH-20 BE2).
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listMyHikes, registerHike } from '../services/hikeService.js';

const router = Router();

// GET /api/hikes → 200 [Hike] | 401 | 403 (staff: they have no hikes of their own)
// The logged-in hiker's hikes, each with its state: planned and in progress first, then completed.
router.get('/', requireRole(['hiker'], 'Only hikers have hikes'), async (req, res) => {
  res.json(await listMyHikes(req.user));
});

// POST /api/hikes {destination, route, passagePoints?, departureAt, expectedReturnAt} → 201 Hike | 400 | 401 | 403
// Hikers only (staff have no hikes of their own). No Location header (openapi.yaml).
router.post('/', requireRole(['hiker'], 'Only hikers can register a hike'), async (req, res) => {
  res.status(201).json(await registerHike(req.user, req.body));
});

export default router;
