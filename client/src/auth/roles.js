// Role check shared by navbar, route guards and pages.
// The warden passes every employee check (context.md, openapi.yaml conventions).
export function hasRole(user, roles) {
  if (!user) return false;
  if (roles.includes(user.role)) return true;
  return user.role === 'warden' && roles.includes('employee');
}
