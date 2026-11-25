// /api/public/meals – meal times and menus of a date range (MH-11 BE1).
// Public: no login, for any user (openapi: listMeals). Same range rules as GET /api/slots.
import { Router } from 'express';
import { validateDateRange } from '../dateRange.js';
import { listMeals } from '../services/mealService.js';

const router = Router();

// GET /api/public/meals?from=YYYY-MM-DD&to=YYYY-MM-DD → 200 [Meal] | 400
// Open slots only, ordered by date and start time; past slots of the range have past: true.
router.get('/', async (req, res) => {
  const { from, to } = req.query;
  validateDateRange(from, to);

  res.json(await listMeals(from, to));
});

export default router;
