// /api/test – routes for automated tests only (e.g. read captured emails). Mounted only when NODE_ENV is test or e2e
// Owner: MH-03 BE1 Booking confirmation email. Empty router mounted by app.js – fill it, do not edit app.js.
import { Router } from 'express';
import { capturedEmails, clearCapturedEmails } from '../notifications/mailer.js';

const router = Router();

// GET /api/test/emails?recipient= – emails captured by the test mailer, oldest first (openapi: listCapturedEmails).
router.get('/emails', (req, res) => {
  const { recipient } = req.query;
  res.json(capturedEmails(typeof recipient === 'string' && recipient ? recipient : undefined));
});

// DELETE /api/test/emails – empties the captured mailbox, so each E2E test starts clean.
router.delete('/emails', (req, res) => {
  clearCapturedEmails();
  res.status(204).end();
});

export default router;
