// Session cookie (U5): httpOnly, sameSite=lax, sessions in sessions.db (dao/sessionStore.js).
// In development the client goes through the Vite proxy: same origin, no CORS.
import session from 'express-session';
import { config } from './config.js';
import { sessionsDbPath } from './dao/db.js';
import { SqliteSessionStore } from './dao/sessionStore.js';

export const SESSION_COOKIE = 'connect.sid'; // name in openapi.yaml (securitySchemes)
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** The express-session middleware, with its store (closed by the tests with store.close()). */
export function createSessionMiddleware(store = new SqliteSessionStore(sessionsDbPath())) {
  const middleware = session({
    name: SESSION_COOKIE,
    secret: config.sessionSecret,
    store,
    resave: false, // the store has touch()
    saveUninitialized: false, // no cookie for guests
    rolling: true, // every request moves the expiry forward: 7 days without using the site
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto', // Secure only over HTTPS (Docker behind a proxy: set trust proxy in sprint 2)
      maxAge: SEVEN_DAYS_MS,
    },
  });
  middleware.store = store;
  return middleware;
}

// express-session uses callbacks: these turn them into Promises.
const call = (req, method) =>
  new Promise((resolve, reject) => req.session[method]((err) => (err ? reject(err) : resolve())));

/**
 * Starts a new session for the user. regenerate() gives a new session id, so an id known
 * before the login (session fixation) is useless afterwards.
 */
export async function logIn(req, user) {
  await call(req, 'regenerate');
  req.session.userId = user.id;
  await call(req, 'save');
}

/** Ends the session, if there is one. */
export async function logOut(req) {
  if (!req.session) return;
  await call(req, 'destroy');
}
