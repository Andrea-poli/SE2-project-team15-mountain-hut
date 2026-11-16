// /api/staff/hikers - search hikers for staff (MH-07).
import { Router } from 'express';
import { BadRequest } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { searchHikers } from '../services/staffHikerService.js';

const router = Router();

router.get('/', requireRole(['employee'], 'Staff only'), async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || q.trim().length < 2) {
    throw new BadRequest('Type at least 2 characters to search');
  }

  return res.json(await searchHikers(q.trim()));
});

export default router;
