// Login and role checks (U5). loadUser runs on every request (app.js); the routes use
// requireLogin / requireRole:
//   router.post('/', requireRole(['hiker'], 'Only hikers can book'), handler)
//   router.get('/', requireRole(['employee'], 'Staff only'), handler)   // the warden passes too
import { Forbidden, Unauthorized } from '../errors.js';
import { findUser } from '../services/authService.js';

export const NOT_LOGGED_IN = 'Not logged in';

/** The warden passes every employee check (openapi.yaml conventions). */
export function hasRole(user, roles) {
  if (!user) return false;
  if (roles.includes(user.role)) return true;
  return user.role === 'warden' && roles.includes('employee');
}

/**
 * Puts the logged-in user in req.user (null for guests). The session keeps only the user id:
 * the user is read again on every request, so a deleted user is logged out at once.
 */
export async function loadUser(req, res, next) {
  req.user = null;
  const id = req.session?.userId;
  if (id == null) return next();
  req.user = await findUser(id);
  if (!req.user) delete req.session.userId; // the account no longer exists
  return next();
}

/** 401 for guests. */
export function requireLogin(req, res, next) {
  if (!req.user) return next(new Unauthorized(NOT_LOGGED_IN));
  return next();
}

/** 401 for guests, 403 (with `message`) for users without one of `roles`. */
export function requireRole(roles, message) {
  return (req, res, next) => {
    if (!req.user) return next(new Unauthorized(NOT_LOGGED_IN));
    if (!hasRole(req.user, roles)) return next(new Forbidden(message));
    return next();
  };
}
