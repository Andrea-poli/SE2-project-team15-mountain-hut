// Role checks and role-based redirects, shared by navbar, route guards and the login/register pages.
import { matchPath } from 'react-router';
import { pageRoles, routes } from '../routes.js';

// The warden passes every employee check (openapi.yaml conventions).
export function hasRole(user, roles) {
  if (!user) return false;
  if (roles.includes(user.role)) return true;
  return user.role === 'warden' && roles.includes('employee');
}

// First page of each role: staff (employee, warden) → slots, hiker → home.
export function homeFor(user) {
  return hasRole(user, ['employee']) ? routes.staffSlots : routes.home;
}

// Where to go after login/register: `next` only if it is an internal path the user may open,
// otherwise the role's first page. The URL parser decides what is another site, the same way the
// browser does: "//site", "/\site" and "/<tab>/site" (?next=/%09/site, the parser drops tabs and
// newlines) all have another origin. Login and register are never a destination.
export function nextFor(user, next) {
  if (typeof next !== 'string' || !next.startsWith('/')) return homeFor(user);
  const url = new URL(next, window.location.origin);
  if (url.origin !== window.location.origin) return homeFor(user);
  if (url.pathname === routes.login || url.pathname === routes.register) return homeFor(user);
  const page = Object.keys(pageRoles).find((pattern) => matchPath(pattern, url.pathname));
  if (page && !hasRole(user, pageRoles[page])) return homeFor(user);
  return url.pathname + url.search + url.hash;
}
