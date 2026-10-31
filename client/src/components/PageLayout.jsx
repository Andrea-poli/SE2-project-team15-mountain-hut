// Frame of every page: skip link, navbar and main area. Used as the root layout route,
// so the navbar stays mounted while the pages change in <Outlet />.
import Container from 'react-bootstrap/Container';
import { Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth.js';
import AppNavbar from './AppNavbar.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import ErrorMessage from './ErrorMessage.jsx';

// Moves the focus itself instead of following #main: the URL hash stays free for the router.
function skipToMain(event) {
  event.preventDefault();
  document.getElementById('main')?.focus();
}

export default function PageLayout() {
  const { error } = useAuth();
  const { pathname } = useLocation();

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
