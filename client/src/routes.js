// Page addresses, in one place: used by the router, the navbar and RequireRole.
// Paths with parameters are filled with generatePath from react-router,
// e.g. generatePath(routes.bookingConfirmed, { id: 7 }) → "/bookings/7".
export const routes = {
  home: '/',
  checkAvailability: '/availability', // provisional: to be confirmed with the team
  login: '/login',
  register: '/register',
  book: '/book',
  bookingConfirmed: '/bookings/:id',
  staffSlots: '/staff/slots',
  newSlot: '/staff/slots/new',
};

// Roles needed by each protected page; pages not listed are public.
// The router passes the same lists to RequireRole and nextFor (auth/roles.js) checks them
// after login, so the two never disagree.
export const pageRoles = {
  [routes.book]: ['hiker'],
  [routes.bookingConfirmed]: ['hiker'], // MH-01 booking confirmation
  [routes.staffSlots]: ['employee'],
  [routes.newSlot]: ['employee'],
};
