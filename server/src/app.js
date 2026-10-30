// ★ Shared file (planning 4.5): it already mounts every route of sprint 1.
// Stories fill their own route file; changes here only in #0 tasks or after agreeing in the group chat.
import express from 'express';
import { config, isTestEnv } from './config.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import authRouter from './routes/auth.js';
import availabilityRouter from './routes/availability.js';
import bookingsRouter from './routes/bookings.js';
import publicSlotsRouter from './routes/publicSlots.js';
import slotsRouter from './routes/slots.js';
import testSupportRouter from './routes/testSupport.js';
import { createSessionMiddleware } from './session.js';

/** @param {{ sessionStore?: object }} options a test can pass its own session store, to close it */
export function createApp({ sessionStore } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // U5: session cookie (httpOnly, sameSite=lax, store in sessions.db), then req.user for every request.
  app.use('/api', createSessionMiddleware(sessionStore));
  app.use('/api', loadUser);

  // Public routes live under /api/public, so they never pass through the staff router of /api/slots.
  app.use('/api/auth', authRouter); //               U5
  app.use('/api/public/slots', publicSlotsRouter); // MH-01
  app.use('/api/bookings', bookingsRouter); //        MH-01
  app.use('/api/slots', slotsRouter); //              MH-02
  app.use('/api/availability', availabilityRouter); // MH-04
  if (isTestEnv(config.env)) {
    app.use('/api/test', testSupportRouter); //       MH-03 (tests only)
  }

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
