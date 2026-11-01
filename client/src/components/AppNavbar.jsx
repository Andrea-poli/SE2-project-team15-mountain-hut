// Navbar with the entries of the current role. Colours in theme.css (.navbar.bg-primary).
// NavLink marks the current page with the "active" class and aria-current="page".
import { CalendarDays, CalendarPlus, CalendarSearch, DoorClosed, DoorOpen, Mountain, User, UserPlus } from 'lucide-react';
import { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link, NavLink, useNavigate } from 'react-router';
import { hasRole, homeFor } from '../auth/roles.js';
import { useAuth } from '../auth/useAuth.js';
import { routes } from '../routes.js';

// Icon next to the text; decoration only, the text says it all.
// eventKey is only for collapseOnSelect (closes the mobile menu). active={false} turns off
// react-bootstrap's own "active" (the last clicked eventKey, kept by Nav even after the URL changes):
// the current page comes only from NavLink, which compares with the URL.
function NavItem({ to, icon: Icon, children, className }) {
  return (
    <Nav.Link as={NavLink} to={to} eventKey={to} active={false} className={className}>
      <Icon aria-hidden="true" size={20} className="me-2" />
      {children}
    </Nav.Link>
  );
}

export default function AppNavbar() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const isStaff = hasRole(user, ['employee']);
  // Mobile menu open or closed: controlled, so the toggle can expose aria-expanded and the
  // logo and logout can close the menu too.
  const [expanded, setExpanded] = useState(false);

  async function handleLogout() {
    setExpanded(false);
    // Leave the page first: if user became null while on a protected page,
    // RequireRole would send to /login?next=... as if the session had expired.
    navigate(routes.home);
    try {
      await logout();
    } catch {
      // The message is in the auth error, shown by PageLayout on the home page.
    }
  }

  return (
    // collapseOnSelect: on small screens the menu closes after choosing an entry.
    <Navbar expand="md" bg="primary" data-bs-theme="dark" collapseOnSelect expanded={expanded} onToggle={setExpanded}>
      <Container>
        {/* The logo leads to the role's first page: slots for staff, home for hikers and guests.
            It is not a Nav entry, so it closes the menu itself. */}
        <Navbar.Brand as={Link} to={homeFor(user)} onClick={() => setExpanded(false)}>
          <Mountain aria-hidden="true" size={24} className="me-2" />
          Mountain Hut
        </Navbar.Brand>
        {/* label becomes the aria-label (react-bootstrap overwrites aria-label with it). */}
        <Navbar.Toggle aria-controls="main-navbar" aria-expanded={expanded} label="Open menu" />
        <Navbar.Collapse id="main-navbar">
          {/* Both sides are empty during the startup check: user is still null, and showing the
              guest entries ("Check availability", "Log in") would flash the wrong menu. */}
          <Nav className="me-auto">
            {!loading && isStaff && (
              <NavItem to={routes.staffSlots} icon={CalendarDays}>
                Slots
              </NavItem>
            )}
            {!loading && !isStaff && (
              <NavItem to={routes.checkAvailability} icon={CalendarSearch}>
                Check availability
              </NavItem>
            )}
            {user?.role === 'hiker' && (
              <NavItem to={routes.book} icon={CalendarPlus}>
                Book a table
              </NavItem>
            )}
          </Nav>
          <Nav className="align-items-md-center">
            {loading ? null : user ? (
              <>
                <Navbar.Text className="d-flex align-items-center me-md-2">
                  <User aria-hidden="true" size={20} className="me-2" />
                  {user.firstName}
                </Navbar.Text>
                <Nav.Link as="button" type="button" eventKey="logout" active={false} onClick={handleLogout}>
                  <DoorClosed aria-hidden="true" size={20} className="me-2" />
                  Log out
                </Nav.Link>
              </>
            ) : (
              <>
                <NavItem to={routes.login} icon={DoorOpen}>
                  Log in
                </NavItem>
                {/* Same link as the others; bold (600) to tell it apart from "Log in". */}
                <NavItem to={routes.register} icon={UserPlus} className="fw-semibold">
                  Register
                </NavItem>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
