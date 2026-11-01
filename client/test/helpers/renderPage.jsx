// Renders a page (or the whole layout) the way the app does: AuthProvider + router, starting at `url`.
// The test file must mock '../../src/api/auth.js' (vi.mock is hoisted only in the test file itself),
// so AuthProvider talks to the mocked api instead of a server.
//
//   renderPage(<LoginPage />, { path: '/login', url: '/login?next=/book' });
//   renderPage(<p>Book</p>, { path: '/book', guard: <RequireRole roles={['hiker']} /> });
//   renderPage(<p>Content</p>, { path: '/x', layout: <PageLayout /> });
//
// Every other address shows "Landed on <path+query>", so a test can check where the app navigated.
/* eslint-disable react-refresh/only-export-components -- test helper, never hot-reloaded */
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';

function Landing() {
  const location = useLocation();
  return <p>Landed on {location.pathname + location.search}</p>;
}

export function renderPage(element, { path, url = path, layout, guard } = {}) {
  const page = <Route key="page" path={path} element={element} />;
  const routes = [
    // A guard (RequireRole) protects only the page, like the groups of pages in App.jsx.
    guard ? (
      <Route key="guard" element={guard}>
        {page}
      </Route>
    ) : (
      page
    ),
    <Route key="landing" path="*" element={<Landing />} />,
  ];
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[url]}>
        {/* With a layout (PageLayout) every address is inside it, as in App.jsx. */}
        <Routes>{layout ? <Route element={layout}>{routes}</Route> : routes}</Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}
