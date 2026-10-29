// Guard for pages that need a role. Used as a layout route, so one guard covers a group of pages:
//   <Route element={<RequireRole roles={['employee']} />}> ...staff pages... </Route>
// The warden passes every employee check (hasRole).
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import Loading from '../components/Loading.jsx';
import { routes } from '../routes.js';
import { hasRole, homeFor } from './roles.js';
import { useAuth } from './useAuth.js';

export default function RequireRole({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Wait for the startup check: otherwise a logged-in user would be sent to the login page on reload.
  if (loading) return <Loading />;

  if (!user) {
    // After logging in, the login page brings the user back here (path and query).
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate replace to={`${routes.login}?next=${next}`} />;
  }

  if (!hasRole(user, roles)) return <NotAvailable user={user} />;

  return <Outlet />;
}

function NotAvailable({ user }) {
  const home = homeFor(user);
  return (
    <>
      <h1>Page not available</h1>
      <p>This page is not available for your role.</p>
      <Link to={home}>{home === routes.staffSlots ? 'Go to slots' : 'Go to the home page'}</Link>
    </>
  );
}
