// Frame of every page: skip link, navbar and main area. Used as the root layout route,
// so the navbar stays mounted while the pages change in <Outlet />.
import Container from 'react-bootstrap/Container';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth.js';
import AppNavbar from './AppNavbar.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import { routes } from '../routes.js';

// MH-07: a hiker with a generated password (mustChangePassword) is sent to Change password from every page,
// until they choose their own (PO #36). The reset pages stay open, so a forgotten password can still be reset.
const OPEN_WHILE_CHANGE_NEEDED = [routes.changePassword, routes.forgotPassword, routes.resetPassword];

// Moves the focus itself instead of following #main: the URL hash stays free for the router.
function skipToMain(event) {
  event.preventDefault();
  document.getElementById('main')?.focus();
}

export default function PageLayout() {
  const { user, error } = useAuth();
  const { pathname } = useLocation();
  if (user?.mustChangePassword && !OPEN_WHILE_CHANGE_NEEDED.includes(pathname)) {
    return <Navigate replace to={routes.changePassword} />;
  }

  return (
    <>
      {/* First focusable element: keyboard users can jump over the navbar. */}
      <a href="#main" className="visually-hidden-focusable mh-skip-link" onClick={skipToMain}>
        Skip to main content
      </a>
      <AppNavbar />
      {/* tabIndex -1: the skip link moves the focus here, not only the scroll. */}
      <main id="main" tabIndex={-1}>
        <Container className="py-4">
          <ErrorMessage message={error} />
          {/* A page that crashes shows a message here; key: a new page starts without the error. */}
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </Container>
      </main>
    </>
  );
}
