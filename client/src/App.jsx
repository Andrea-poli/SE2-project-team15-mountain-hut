// ★ Shared file (planning 3.4): the router listing every page of the sprint.
// Each story fills only its own page file; addresses come from routes.js, roles from pageRoles.
// AuthProvider is in main.jsx, so tests can wrap App with their own provider.
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import RequireRole from './auth/RequireRole.jsx';
import Loading from './components/Loading.jsx';
import PageLayout from './components/PageLayout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import BookingConfirmedPage from './pages/hiker/BookingConfirmedPage.jsx';
import BookPage from './pages/hiker/BookPage.jsx';
import CheckAvailabilityPage from './pages/public/CheckAvailabilityPage.jsx';
import HomePage from './pages/public/HomePage.jsx';
import LoginPage from './pages/public/LoginPage.jsx';
import NewSlotPage from './pages/staff/NewSlotPage.jsx';
import SlotsWeekPage from './pages/staff/SlotsWeekPage.jsx';
import { pageRoles, routes } from './routes.js';

// Loaded on its own: the phone library (flags, metadata, CSS) stays out of the bundle of the other pages.
const RegisterPage = lazy(() => import('./pages/public/RegisterPage.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Every page inside the same layout: skip link, navbar, main. */}
        <Route element={<PageLayout />}>
          {/* Public */}
          <Route path={routes.home} element={<HomePage />} />
          <Route path={routes.checkAvailability} element={<CheckAvailabilityPage />} />
          <Route path={routes.login} element={<LoginPage />} />
          <Route
            path={routes.register}
            element={
              <Suspense fallback={<Loading />}>
                <RegisterPage />
              </Suspense>
            }
          />

          {/* Hiker */}
          <Route element={<RequireRole roles={pageRoles[routes.book]} />}>
            <Route path={routes.book} element={<BookPage />} />
            <Route path={routes.bookingConfirmed} element={<BookingConfirmedPage />} />
          </Route>

          {/* Staff (employee; the warden passes too) */}
          <Route element={<RequireRole roles={pageRoles[routes.staffSlots]} />}>
            <Route path={routes.staffSlots} element={<SlotsWeekPage />} />
            <Route path={routes.newSlot} element={<NewSlotPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
