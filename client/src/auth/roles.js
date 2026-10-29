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
// otherwise the role's first page. Blocks "//site" and "/\site" (other sites) and login/register.
export function nextFor(user, next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return homeFor(user);
  }
  const pathname = next.split(/[?#]/)[0];
  if (pathname === routes.login || pathname === routes.register) return homeFor(user);
  const page = Object.keys(pageRoles).find((pattern) => matchPath(pattern, pathname));
  if (page && !hasRole(user, pageRoles[page])) return homeFor(user);
  return next;
}
