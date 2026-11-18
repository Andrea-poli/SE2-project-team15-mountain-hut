// MH-06 FT1 – unit tests of the hiker's bookings pages (MyBookingsPage + ChangeBookingPage, MH-06 FE1 and FE2).
// Written before the pages, from MH-06 (PO issues #38, #41, #43), docs/openapi.yaml and the plan: these tests
// are the agreed CONTRACT the pages are built to pass. Behaviour only – roles, labels, visible text – never
// markup or classes: layout, styling and extra wording are free.
//
// THE CONTRACT
//  API  client/src/api/bookings.js also exports listMyBookings() → MyBooking[] (GET /api/bookings: upcoming
//       first, then past; each with `changeable`) and changeBooking(id, change) → Booking
//       (PATCH /api/bookings/{id}, `change` with only the fields that changed: slotId, partySize, requirements).
//
//  My bookings – routes.myBookings ('/my-bookings'; '/bookings/:id' is already the confirmation), hikers only.
//  M1  <h1> "My bookings", title "My bookings – Mountain Hut". A hiker's navbar has a link "My bookings".
//  M2  One list item per booking, in the order of the API (the server sorts). Each shows the date (formatDate),
//      label and time range (formatTimeRange), the party (peopleText), the seating (seatSplitText, never table
//      names) and the requirements; a requirement with allergies says "allergies".
//  M3  A cancelled booking says "Cancelled"; a booking whose slot has started says "Past".
//  M4  A changeable booking has a link "Change" → /my-bookings/<id>/change. When `changeable` is false and the
//      booking is confirmed and upcoming, there is no Change link and the item says
//      "Changes close 48 hours before the meal". Cancelled and past bookings have no Change link.
//  M5  No bookings → "You have no bookings yet" and a link "Book a table" (routes.book). A load error → role=alert.
//  M6  After a change the list says "Booking changed" (role="status").
//
//  Change – routes.changeBooking ('/my-bookings/:id/change'), hikers only.
//  X1  <h1> "Change booking". The SlotPicker (Date, Time, Number of people) is prefilled with the booking; the
//      booking is read from listMyBookings(). Not one of the hiker's bookings, or not changeable → a message
//      and a link back to My bookings, no form.
//  X2  Button "Save changes": changeBooking(id, change) with only the changed fields (numbers, not strings);
//      nothing changed → no call and a message "Nothing to change". While saving the button is disabled and
//      may say "Saving…" (like "Booking…" on the Book page).
//  X3  Empty or invalid fields: the same errors as the Book page, on the field; nothing sent.
//  X4  Server errors: 409 → on "Time" (as on the Book page); 400 → role=alert with the server's message.
//  X5  Success → back to My bookings, which says "Booking changed" (M6). A link "Back" goes to My bookings.
//  X6  Requirements: the editor of MH-05 (PartyRequirementsForm) is prefilled; changing them is sent as
//      `requirements` (tested once MH-05 FE1 is merged).
//
//  Both pages are inside RequireRole(['hiker']) in App.jsx: a guest goes to /login?next=…, staff get
//  "Page not available" (the guard of the other hiker pages).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as bookingsApi from '../../../src/api/bookings.js';
import { ApiError } from '../../../src/api/client.js';
import * as publicSlotsApi from '../../../src/api/publicSlots.js';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import PageLayout from '../../../src/components/PageLayout.jsx';
import ChangeBookingPage from '../../../src/pages/hiker/ChangeBookingPage.jsx';
import MyBookingsPage from '../../../src/pages/hiker/MyBookingsPage.jsx';
import { routes } from '../../../src/routes.js';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/bookings.js', () => ({
  createBooking: vi.fn(), getBooking: vi.fn(), listMyBookings: vi.fn(), changeBooking: vi.fn(),
}));
vi.mock('../../../src/api/publicSlots.js', () => ({ listPublicSlots: vi.fn() }));

// "Now": Tuesday 3 November 2026, 10:00 in the hut.
const NOW = new Date(2026, 10, 3, 10, 0);
const SLOTS = [
  { id: 10, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' },
  { id: 11, label: 'Dinner – 1st turn', startTime: '19:00', endTime: '20:30', bookingState: 'bookable' },
];

const booking = (over) => ({
  id: 7,
  slot: { id: 10, date: '2026-11-10', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
  partySize: 3,
  tables: [{ slotTableId: 1, tableName: 'T1', seats: 2 }, { slotTableId: 2, tableName: 'T2', seats: 1 }],
  requirements: [],
  status: 'confirmed',
  createdAt: '2026-10-30T09:00:00Z',
  changeable: true,
  ...over,
});
const UPCOMING = booking({
  requirements: [
    { hasAllergies: true, description: '1 shellfish allergy' },
    { hasAllergies: false, description: '2 vegetarians' },
  ],
});
const SOON = booking({
  id: 8, changeable: false,
  slot: { id: 11, date: '2026-11-04', startTime: '19:00', endTime: '20:30', label: 'Dinner – 1st turn' },
});
const CANCELLED = booking({ id: 9, status: 'cancelled', changeable: false, tables: [] });
const PAST = booking({
  id: 6, changeable: false, slot: { id: 5, date: '2026-10-28', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
});

const MY_BOOKINGS = '/my-bookings';
const changeUrl = (id) => `/my-bookings/${id}/change`;

function renderList(url = MY_BOOKINGS) {
  renderPage(<MyBookingsPage />, { path: MY_BOOKINGS, url, guard: <RequireRole roles={['hiker']} /> });
}
function renderChange(id = 7) {
  renderPage(<ChangeBookingPage />, { path: '/my-bookings/:id/change', url: changeUrl(id),
    guard: <RequireRole roles={['hiker']} /> });
}
const item = (text) => screen.getAllByRole('listitem').find((li) => li.textContent.includes(text));
const saveButton = () => screen.getByRole('button', { name: /^(Save changes|Saving…?)$/ });
const party = () => screen.getByLabelText('Number of people');

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(authApi.me).mockResolvedValue(hiker);
  vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
  vi.mocked(bookingsApi.listMyBookings).mockResolvedValue([SOON, UPCOMING, CANCELLED, PAST]);
});
afterEach(() => vi.useRealTimers());

describe('contract: routes and API', () => {
  it('names the two pages in routes.js', () => {
    expect(routes.myBookings).toBe('/my-bookings');
    expect(routes.changeBooking).toBe('/my-bookings/:id/change');
  });
});

describe('MyBookingsPage', () => {
  it('M1: shows the hiker\'s bookings with heading and title, and a navbar link to them', async () => {
    renderPage(<MyBookingsPage />, { path: MY_BOOKINGS, layout: <PageLayout /> });
    expect(await screen.findByRole('heading', { level: 1, name: 'My bookings' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('My bookings – Mountain Hut'));
    const navbar = screen.getByRole('navigation');
    expect(await within(navbar).findByRole('link', { name: 'My bookings' })).toHaveAttribute('href', MY_BOOKINGS);
  });

  it('M2: one item per booking, in the order of the API', async () => {
    renderList();
    await screen.findByRole('heading', { level: 1, name: 'My bookings' });
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Wed 4 Nov');
    expect(items[1]).toHaveTextContent('Tue 10 Nov');
  });

  it('M2: an item shows date, slot, time, party, seating and requirements, never table names', async () => {
    renderList();
    await screen.findByRole('heading', { level: 1, name: 'My bookings' });
    const upcoming = await waitFor(() => item('Tue 10 Nov'));
    const expected = ['Lunch', '12:00 – 14:00', '3 people', '2 + 1 seats', '1 shellfish allergy', '2 vegetarians'];
    for (const text of expected) {
      expect(upcoming).toHaveTextContent(text);
    }
    expect(upcoming).toHaveTextContent(/allergies/i);
    expect(upcoming).not.toHaveTextContent(/\bT[12]\b/);
  });

  it('M3: a cancelled booking says Cancelled, a booking already started says Past', async () => {
    renderList();
    await screen.findByRole('heading', { level: 1, name: 'My bookings' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('Cancelled');
    expect(item('Wed 28 Oct')).toHaveTextContent('Past');
  });

  it('M4: Change links only on changeable bookings; less than 48 h left says why', async () => {
    renderList();
    await screen.findByRole('heading', { level: 1, name: 'My bookings' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    const [soon, upcoming, cancelled, past] = screen.getAllByRole('listitem');
    expect(within(upcoming).getByRole('link', { name: 'Change' })).toHaveAttribute('href', changeUrl(7));
    for (const li of [soon, cancelled, past]) expect(within(li).queryByRole('link', { name: 'Change' })).toBeNull();
    expect(soon).toHaveTextContent('Changes close 48 hours before the meal');
    expect(cancelled).not.toHaveTextContent('Changes close 48 hours before the meal');
  });

  it('M5: no bookings → a message and a link to book; a load error → alert', async () => {
    vi.mocked(bookingsApi.listMyBookings).mockResolvedValueOnce([]);
    renderList();
    expect(await screen.findByText('You have no bookings yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book a table' })).toHaveAttribute('href', routes.book);
  });

  it('M5: a load error is shown in an alert', async () => {
    vi.mocked(bookingsApi.listMyBookings).mockRejectedValueOnce(new ApiError(0, 'Cannot reach the server.'));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('guard: a guest is sent to log in; staff cannot open the page', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError(401, 'Not logged in'));
    const { unmount } = renderPage(<MyBookingsPage />, {
      path: MY_BOOKINGS, url: MY_BOOKINGS, guard: <RequireRole roles={['hiker']} />,
    });
    expect(await screen.findByText(`Landed on /login?next=${encodeURIComponent(MY_BOOKINGS)}`)).toBeInTheDocument();
    unmount();

    vi.mocked(authApi.me).mockResolvedValueOnce(employee);
    renderList();
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not available' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'My bookings' })).not.toBeInTheDocument();
    expect(bookingsApi.listMyBookings).not.toHaveBeenCalled();
  });
});

describe('ChangeBookingPage', () => {
  it('X1: prefills Date, Time and Number of people from the booking', async () => {
    renderChange(7);
    expect(await screen.findByRole('heading', { level: 1, name: 'Change booking' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue('2026-11-10'));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Time' })).toHaveValue('10'));
    expect(party()).toHaveValue(3);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', MY_BOOKINGS);
  });

  it('X1: a booking that cannot be changed (or is not the hiker\'s) shows no form', async () => {
    renderChange(8);
    expect(await screen.findByText(/Changes close 48 hours before the meal/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My bookings|Back/ })).toHaveAttribute('href', MY_BOOKINGS);
  });

  it('X2: sends only the changed fields, as numbers, then goes back with "Booking changed"', async () => {
    vi.mocked(bookingsApi.changeBooking).mockResolvedValue(booking({ partySize: 5 }));
    renderChange(7);
    await waitFor(() => expect(party()).toHaveValue(3));
    await userEvent.clear(party());
    await userEvent.type(party(), '5');
    await userEvent.click(saveButton());

    await waitFor(() => expect(bookingsApi.changeBooking).toHaveBeenCalledWith(7, { partySize: 5 }));
    expect(await screen.findByText(/^Landed on \/my-bookings/)).toBeInTheDocument();
  });

  it('X2: a new time sends only the slot', async () => {
    vi.mocked(bookingsApi.changeBooking).mockResolvedValue(booking({ slot: { ...UPCOMING.slot, id: 11 } }));
    renderChange(7);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Time' })).toHaveValue('10'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time' }), '11');
    await userEvent.click(saveButton());

    await waitFor(() => expect(bookingsApi.changeBooking).toHaveBeenCalledWith(7, { slotId: 11 }));
  });

  it('X2: nothing changed → no call and "Nothing to change"', async () => {
    renderChange(7);
    await waitFor(() => expect(party()).toHaveValue(3));
    await userEvent.click(saveButton());

    expect(await screen.findByText('Nothing to change')).toBeInTheDocument();
    expect(bookingsApi.changeBooking).not.toHaveBeenCalled();
  });

  it('X2: the button is disabled while saving, so a second click sends nothing more', async () => {
    let finish;
    vi.mocked(bookingsApi.changeBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderChange(7);
    await waitFor(() => expect(party()).toHaveValue(3));
    await userEvent.clear(party());
    await userEvent.type(party(), '4');
    await userEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    await userEvent.click(saveButton());
    expect(bookingsApi.changeBooking).toHaveBeenCalledTimes(1);
    finish(booking({ partySize: 4 }));
  });

  it('X3: an empty party size is shown on the field, focused, and nothing is sent', async () => {
    renderChange(7);
    await waitFor(() => expect(party()).toHaveValue(3));
    await userEvent.clear(party());
    await userEvent.click(saveButton());

    expect(party()).toHaveAccessibleDescription(/^Enter the number of people, at least 1\./);
    await waitFor(() => expect(party()).toHaveFocus());
    expect(bookingsApi.changeBooking).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'Not enough seats available for this party'],
    [409, 'You already have a booking for this slot'],
  ])('X4: a %i is shown on the Time field: %s', async (status, message) => {
    vi.mocked(bookingsApi.changeBooking).mockRejectedValue(new ApiError(status, message));
    renderChange(7);
    await waitFor(() => expect(party()).toHaveValue(3));
    await userEvent.clear(party());
    await userEvent.type(party(), '9');
    await userEvent.click(saveButton());

    const time = screen.getByRole('combobox', { name: 'Time' });
    await waitFor(() => expect(time).toHaveAccessibleDescription(new RegExp(`^${message}`)));
    expect(screen.queryByText(/^Landed on/)).not.toBeInTheDocument();
  });

  it('X4: a 400 (e.g. the 48 h window closed meanwhile) is shown in an alert', async () => {
    const message = 'Bookings can be changed up to 48 hours before the slot starts';
    vi.mocked(bookingsApi.changeBooking).mockRejectedValue(new ApiError(400, message));
    renderChange(7);
    await waitFor(() => expect(party()).toHaveValue(3));
    await userEvent.clear(party());
    await userEvent.type(party(), '4');
    await userEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('X5 / M6: opened normally, My bookings has no "Booking changed" message', async () => {
    // After a change the page passes the message with the navigation (router state or a query): both are
    // free choices, so "Booking changed" after a real change is checked end to end in e2e/changeBooking.spec.js.
    renderList();
    await screen.findByRole('heading', { level: 1, name: 'My bookings' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    expect(screen.queryByText('Booking changed')).not.toBeInTheDocument();
  });
});
