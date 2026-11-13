// ★ Shared file (planning 4.5): it already mounts every route of sprint 1.
// Stories fill their own route file; changes here only in #0 tasks or after agreeing in the group chat.
import express from 'express';
import { config, isTestEnv } from './config.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { clientRouter } from './clientApp.js';
import authRouter from './routes/auth.js';
import availabilityRouter from './routes/availability.js';
import bookingsRouter from './routes/bookings.js';
import publicSlotsRouter from './routes/publicSlots.js';
import slotsRouter from './routes/slots.js';
import testSupportRouter from './routes/testSupport.js';
import { createSessionMiddleware } from './session.js';

/**
 * @param {{ sessionStore?: object, clientDist?: string | null }} options a test can pass its own session store,
 *   to close it, and a client build folder (by default the one of config: client/dist in production, none otherwise)
 */
export function createApp({ sessionStore, clientDist = config.clientDist } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // Health check (Docker HEALTHCHECK, monitoring): before the session middleware, so a probe every few
  // seconds creates no session and touches no database. GET only; other methods fall through to the 404.
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // U5: session cookie (httpOnly, sameSite=lax, store in sessions.db), then req.user for every request.
  app.use('/api', createSessionMiddleware(sessionStore));
  app.use('/api', loadUser);

  // Public routes live under /api/public, so they never pass through the staff router of /api/slots.
  app.use('/api/auth', authRouter); //               U5
  app.use('/api/public/slots', publicSlotsRouter); // MH-01
  app.use('/api/bookings', bookingsRouter); //        MH-01
  app.use('/api/slots', slotsRouter); //              MH-02
  app.use('/api/public/slots/:id/availability', availabilityRouter); // MH-04
  if (isTestEnv(config.env)) {
    app.use('/api/test', testSupportRouter); //       MH-03 (tests only)
  }

  app.use('/api', notFound);
  if (clientDist) app.use(clientRouter(clientDist)); // D1: the built client, production only
  app.use(errorHandler);
  return app;
}
