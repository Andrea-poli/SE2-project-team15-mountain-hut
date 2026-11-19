// MH-07 FT1 – unit tests of "Reserve for a hiker" (staff): StaffReservationPage with HikerPanel, SlotPicker
// (untilStart) and the party requirements, written from the story MH-07, the PO answers in docs/openapi.yaml
// (issues #5, #35, #36) and the contract – NOT from the code. Behaviour only: roles, labels, visible text and
// the API calls; layout, styling and extra wording are free.
//
// THE CONTRACT
//  API  api/staff.js: searchHikers(q) → HikerSummary[] (GET /api/staff/hikers?q=, q at least 2 characters
//       after trimming; matches name, email or phone) and createStaffBooking(body) → StaffBooking
//       (POST /api/staff/bookings). HikerSummary: { id, firstName, lastName, email, phone, temporary }.
//       StaffBooking: a Booking plus `hiker` (HikerSummary) and, only for a new full hiker, `generatedPassword`.
//  R1  routes.staffNewBooking ('/staff/bookings/new'): employee and warden. A hiker gets "Page not available",
//      a guest goes to /login?next=…. The navbar has "New reservation" only for staff.
//  R2  Three ways to say who the booking is for: "Existing hiker", "New hiker", "Quick entry".
//  R3  Existing hiker: a "Search" field; no request under 2 characters (after trimming); name, email or phone are
//      sent as typed (trimmed); every result can be chosen; a live count ("1 hiker found", "No hikers found");
//      a temporary hiker is marked as such; the chosen hiker is shown ("Booking for: …"). An older answer never
//      replaces a newer one; a search error is shown (role="alert").
//  R4  New hiker: First name, Last name, Email, Mobile number required; Notes, Emergency contact optional; the
//      same checks as Register (valid email, mobile number for the chosen country, length limits); NO password
//      field (the server generates it, PO #36).
//  R5  Quick entry (temporary hiker, PO #5): First name required, Mobile number optional (an invalid one is
//      refused, an empty one is not sent); no Email and no password.
//  R6  The body has exactly one of hikerId | newHiker | temporaryHiker (the mode shown), plus slotId and
//      partySize as numbers, and `requirements` only when there are some.
//  R7  Slots for staff (PO #35): no 2-hour rule, a slot can be chosen until it starts; a started slot is shown
//      disabled with "– started"; full slots stay disabled. The Book page (hiker) keeps the 2-hour rule.
//  R8  Empty submit: an error on every wrong field, focus on the first one, nothing sent. As in every form, a
//      field that shows an error is checked again when left.
//  R9  Server refusals on their field: "Email already in use" (409) → Email; "Hiker not found" (404) → Search;
//      not enough seats / already booked (409) and "This slot has already started" (400) → Time; anything
//      else → role="alert" above the form, with the focus on it. One request at a time.
//  R10 Party requirements: the same editor and checks as the Book page (MH-05).
//  R11 Confirmation: "Reservation confirmed", who it is for, date, time, party, the seat split (never table
//      names), the requirements. A new hiker: the generated password, shown once, with "Copy password" →
//      "Copied", and a message when the copy fails. No password for existing or temporary hikers. A button
//      starts a new reservation with an empty form.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as bookingsApi from '../../../src/api/bookings.js';
import { ApiError } from '../../../src/api/client.js';
import * as publicSlotsApi from '../../../src/api/publicSlots.js';
import * as staffApi from '../../../src/api/staff.js';
import App from '../../../src/App.jsx';
import { AuthProvider } from '../../../src/auth/AuthContext.jsx';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import BookPage from '../../../src/pages/hiker/BookPage.jsx';
import StaffReservationPage from '../../../src/pages/staff/StaffReservationPage.jsx';
import { pageRoles, routes } from '../../../src/routes.js';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker, warden } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/publicSlots.js', () => ({ listPublicSlots: vi.fn() }));
vi.mock('../../../src/api/bookings.js', () => ({ createBooking: vi.fn(), getBooking: vi.fn() }));
vi.mock('../../../src/api/staff.js', () => ({ searchHikers: vi.fn(), createStaffBooking: vi.fn() }));

// "Now": Tuesday 3 November 2026, 10:00 in the hut.
const NOW = new Date(2026, 10, 3, 10, 0);
const TODAY = '2026-11-03';
// The slots of today as the server sends them (bookingState is the hikers' view: tooLate under 2 hours).
const SLOTS = [
  { id: 20, label: 'Breakfast', startTime: '08:00', endTime: '09:30', bookingState: 'tooLate' }, // started
  { id: 21, label: 'Lunch', startTime: '11:30', endTime: '13:30', bookingState: 'tooLate' }, // in 1 h 30
  { id: 22, label: 'Tea', startTime: '16:00', endTime: '17:00', bookingState: 'full' },
  { id: 23, label: 'Dinner', startTime: '19:00', endTime: '20:30', bookingState: 'bookable' },
];
const DINNER = 'Dinner, 19:00 – 20:30';
const LUNCH = 'Lunch, 11:30 – 13:30';

const MARCO = {
  id: 4, firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com', phone: '+39 333 1234567',
  temporary: false,
};
const MARIA = {
  id: 5, firstName: 'Maria', lastName: 'Rossini', email: 'maria@example.com', phone: '+39 333 9999999',
  temporary: false,
};
const GIULIA = { id: 9, firstName: 'Giulia', lastName: null, email: null, phone: '+39 333 7654321', temporary: true };
const PASSWORD = 'k7Qp2xWm9aTz';
const PO_REQUIREMENTS = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];

const staffBooking = (over) => ({
  id: 101,
  slot: { id: 23, date: TODAY, startTime: '19:00', endTime: '20:30', label: 'Dinner' },
  partySize: 6,
  tables: [{ slotTableId: 3, tableName: 'T3', seats: 4 }, { slotTableId: 5, tableName: 'T5', seats: 2 }],
  requirements: [],
  status: 'confirmed',
  createdAt: '2026-11-03T09:00:00.000Z',
  hiker: MARCO,
  ...over,
});

// --- page helpers ---------------------------------------------------------------------------------------

function renderStaff(user = employee) {
  vi.mocked(authApi.me).mockResolvedValue(user);
  renderPage(<StaffReservationPage />, {
    path: routes.staffNewBooking,
    guard: <RequireRole roles={pageRoles[routes.staffNewBooking]} />,
  });
}

/** The whole app at `url` (the real routes of App.jsx, navbar included). */
function renderApp(url) {
  window.history.pushState({}, '', url);
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

const heading = () => screen.findByRole('heading', { level: 1, name: 'New reservation' });
const modeRadio = (name) => screen.getByRole('radio', { name });
const searchBox = () => screen.getByRole('searchbox', { name: 'Search' });
const timeMenu = () => screen.getByRole('combobox', { name: 'Time' });
const confirmButton = () => screen.getByRole('button', { name: 'Confirm reservation' });
const sentBody = () => vi.mocked(staffApi.createStaffBooking).mock.lastCall[0];
const statusTexts = () => screen.queryAllByRole('status').map((s) => s.textContent);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let user;

async function chooseMode(name) {
  await user.click(modeRadio(name));
}

/** Pastes `values` (label → text) in one go each, as the Register tests do (fewer re-renders). */
async function fill(values) {
  for (const [label, text] of Object.entries(values)) {
    await user.click(screen.getByLabelText(label));
    await user.paste(text);
  }
}

async function fillSlot({ time = DINNER, partySize = '6' } = {}) {
  await user.type(screen.getByLabelText('Date'), TODAY);
  await waitFor(() => expect(timeMenu()).toBeEnabled());
  await user.selectOptions(timeMenu(), time);
  await user.type(screen.getByLabelText('Number of people'), partySize);
}

async function chooseExisting(hikerSummary = MARCO, query = 'rossi') {
  vi.mocked(staffApi.searchHikers).mockResolvedValue([hikerSummary]);
  await chooseMode('Existing hiker');
  await user.type(searchBox(), query);
  await user.click(await screen.findByRole('radio', { name: new RegExp(hikerSummary.firstName) }));
}

const NEW_HIKER = {
  'First name': ' Paolo ',
  'Last name': 'Neri',
  Email: 'paolo.neri@example.com',
  'Mobile number': '3335551234',
};

const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
function setClipboard(value) {
  Object.defineProperty(window.navigator, 'clipboard', { value, configurable: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  user = userEvent.setup({ delay: null });
  vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
  vi.mocked(staffApi.searchHikers).mockResolvedValue([]);
  vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking());
});
afterEach(() => {
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(window.navigator, 'clipboard', originalClipboard);
  window.history.pushState({}, '', '/');
});

// --- R1 -------------------------------------------------------------------------------------------------

describe('R1 access and navbar', () => {
  it('names the page in routes.js', () => {
    expect(routes.staffNewBooking).toBe('/staff/bookings/new');
  });

  it.each([
    ['an employee', employee],
    ['a warden', warden],
  ])('%s opens the page from the navbar entry "New reservation"', async (_who, staff) => {
    vi.mocked(authApi.me).mockResolvedValue(staff);
    renderApp('/availability');
    const navbar = screen.getByRole('navigation');
    const link = await within(navbar).findByRole('link', { name: 'New reservation' });
    expect(link).toHaveAttribute('href', '/staff/bookings/new');
    await user.click(link);
    expect(await heading()).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('New reservation – Mountain Hut'));
  });

  it('a hiker gets "Page not available" and has no navbar entry', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderApp('/staff/bookings/new');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not available' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm reservation' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation')).queryByRole('link', { name: 'New reservation' })).toBeNull();
    expect(staffApi.searchHikers).not.toHaveBeenCalled();
  });

  it('a guest goes to the login page, which brings them back afterwards', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderApp('/staff/bookings/new');
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/login?next=%2Fstaff%2Fbookings%2Fnew');
    expect(within(screen.getByRole('navigation')).queryByRole('link', { name: 'New reservation' })).toBeNull();
  });
});

// --- R2 -------------------------------------------------------------------------------------------------

describe('R2 who the booking is for', () => {
  it('offers three ways: Existing hiker, New hiker, Quick entry, each with its own fields', async () => {
    renderStaff();
    await heading();
    const radios = within(screen.getByRole('group', { name: 'Who is the booking for?' })).getAllByRole('radio');
    expect(radios.map((r) => r.labels[0].textContent)).toEqual(['Existing hiker', 'New hiker', 'Quick entry']);

    await chooseMode('Existing hiker');
    expect(searchBox()).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();

    await chooseMode('New hiker');
    expect(modeRadio('New hiker')).toBeChecked();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    await chooseMode('Quick entry');
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});

// --- R3 -------------------------------------------------------------------------------------------------

describe('R3 search for an existing hiker', () => {
  it('sends no request under 2 characters (spaces do not count)', async () => {
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');
    await user.type(searchBox(), ' R ');
    await pause(600);
    expect(staffApi.searchHikers).not.toHaveBeenCalled();
    expect(statusTexts().filter(Boolean)).toEqual([]);

    await user.clear(searchBox());
    await user.type(searchBox(), 'Ro');
    await waitFor(() => expect(staffApi.searchHikers).toHaveBeenCalledWith('Ro'));
  });

  it.each([
    ['a name', 'rossi'],
    ['an email', 'marco.rossi@example'],
    ['a phone number', '333 1234'],
  ])('searches by %s and every result can be chosen', async (_what, query) => {
    vi.mocked(staffApi.searchHikers).mockResolvedValue([MARCO, MARIA]);
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');
    await user.type(searchBox(), `  ${query} `);
    await waitFor(() => expect(staffApi.searchHikers).toHaveBeenLastCalledWith(query));

    const marco = await screen.findByRole('radio', { name: /Marco Rossi/ });
    const maria = screen.getByRole('radio', { name: /Maria Rossini/ });
    await user.click(maria);
    expect(maria).toBeChecked();
    await user.click(marco);
    expect(marco).toBeChecked();
    expect(maria).not.toBeChecked();
  });

  it('tells how many hikers were found, in a live region', async () => {
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');

    vi.mocked(staffApi.searchHikers).mockResolvedValue([MARCO]);
    await user.type(searchBox(), 'marco');
    await waitFor(() => expect(statusTexts()).toContain('1 hiker found'));

    vi.mocked(staffApi.searchHikers).mockResolvedValue([MARCO, MARIA]);
    await user.type(searchBox(), ' r');
    await waitFor(() => expect(statusTexts()).toContain('2 hikers found'));

    vi.mocked(staffApi.searchHikers).mockResolvedValue([]);
    await user.type(searchBox(), 'zz');
    await waitFor(() => expect(statusTexts()).toContain('No hikers found'));
    expect(screen.queryByRole('radio', { name: /Marco/ })).not.toBeInTheDocument();
  });

  it('marks a temporary hiker in the results', async () => {
    vi.mocked(staffApi.searchHikers).mockResolvedValue([MARCO, GIULIA]);
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');
    await user.type(searchBox(), '333');
    expect(await screen.findByRole('radio', { name: /Giulia.*temporary/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Marco Rossi/ })).not.toHaveAccessibleName(/temporary/i);
  });

  it('shows who the booking is for once a hiker is chosen, and books for that hiker', async () => {
    renderStaff();
    await heading();
    await chooseExisting(MARCO);
    expect(screen.getByText(/Booking for/)).toHaveTextContent(/Booking for:?\s*Marco Rossi/);

    await fillSlot();
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(sentBody()).toEqual({ hikerId: 4, slotId: 23, partySize: 6 });
  });

  it('never shows an older answer after a newer one (typing goes on while a search runs)', async () => {
    let answerRo;
    let failRos;
    vi.mocked(staffApi.searchHikers).mockImplementation((q) => {
      if (q === 'Ro') return new Promise((resolve) => (answerRo = resolve));
      if (q === 'Ros') return new Promise((_resolve, reject) => (failRos = reject));
      return Promise.resolve([MARCO]);
    });
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');

    await user.type(searchBox(), 'Ro');
    await waitFor(() => expect(staffApi.searchHikers).toHaveBeenCalledWith('Ro'));
    await user.type(searchBox(), 's');
    await waitFor(() => expect(staffApi.searchHikers).toHaveBeenCalledWith('Ros'));
    await user.type(searchBox(), 's');
    expect(await screen.findByRole('radio', { name: /Marco Rossi/ })).toBeInTheDocument();

    answerRo([MARIA]); // late answers of older queries
    failRos(new ApiError(500, 'Server error'));
    await pause(50);
    expect(screen.queryByRole('radio', { name: /Maria/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(statusTexts()).toContain('1 hiker found');
  });

  it('shows a search error (e.g. not staff any more) as an alert, with no results', async () => {
    vi.mocked(staffApi.searchHikers).mockRejectedValue(new ApiError(403, 'Staff only'));
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');
    await user.type(searchBox(), 'rossi');
    expect(await screen.findByRole('alert')).toHaveTextContent('Staff only');
    expect(screen.queryByRole('radio', { name: /Rossi/ })).not.toBeInTheDocument();
  });
});

// --- R4 -------------------------------------------------------------------------------------------------

describe('R4 new hiker', () => {
  it('asks for the profile fields of Register, but no password', async () => {
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    for (const label of ['First name', 'Last name', 'Email', 'Mobile number']) {
      expect(screen.getByLabelText(label), label).toBeRequired();
    }
    expect(screen.getByLabelText('Notes (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Emergency contact (optional)')).not.toBeRequired();
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('IT');
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('flags the empty required fields and focuses the first name; nothing is sent', async () => {
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await fillSlot();
    await user.click(confirmButton());

    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription(/first name/i);
    expect(screen.getByLabelText('Last name')).toHaveAccessibleDescription(/last name/i);
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/email/i);
    expect(screen.getByLabelText('Mobile number')).toHaveAccessibleDescription(/mobile number/i);
    expect(screen.getByLabelText('Notes (optional)')).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });

  it('refuses an invalid email and phone with the messages of Register, and too long texts', async () => {
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await fill({
      'First name': 'x'.repeat(101),
      'Last name': 'y'.repeat(101),
      Email: 'paolo@',
      'Mobile number': '12',
      'Notes (optional)': 'n'.repeat(501),
      'Emergency contact (optional)': 'e'.repeat(201),
    });
    await fillSlot();
    await user.click(confirmButton());

    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription(/^First name must be 100 characters or fewer\./);
    expect(screen.getByLabelText('Last name')).toHaveAccessibleDescription(/^Last name must be 100 characters or fewer\./);
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email, e.g. name@example.com.');
    expect(screen.getByLabelText('Mobile number')).toHaveAccessibleDescription(
      /^Enter a valid mobile number for the chosen country\./,
    );
    expect(screen.getByLabelText('Notes (optional)')).toHaveAccessibleDescription(/^Notes must be 500 characters or fewer\./);
    expect(screen.getByLabelText('Emergency contact (optional)')).toHaveAccessibleDescription(
      /^Emergency contact must be 200 characters or fewer\./,
    );
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });

  it('sends the trimmed details, the phone in E.164, and no empty optional field', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(
      staffBooking({ hiker: { ...MARCO, id: 30, firstName: 'Paolo', lastName: 'Neri' }, generatedPassword: PASSWORD }),
    );
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await fill({ ...NEW_HIKER, 'Emergency contact (optional)': ' Anna Neri +39 333 0000000 ' });
    await fillSlot();
    await user.click(confirmButton());

    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(sentBody()).toEqual({
      newHiker: {
        firstName: 'Paolo',
        lastName: 'Neri',
        email: 'paolo.neri@example.com',
        phone: '+393335551234',
        emergencyContact: 'Anna Neri +39 333 0000000',
      },
      slotId: 23,
      partySize: 6,
    });
    expect(JSON.parse(JSON.stringify(sentBody())).newHiker).not.toHaveProperty('notes');
    expect(JSON.stringify(sentBody())).not.toMatch(/password/i);
  });
});

// --- R5 -------------------------------------------------------------------------------------------------

describe('R5 quick entry', () => {
  it('asks only for a first name, with an optional last name and phone: no email, no password', async () => {
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    expect(screen.getByLabelText('First name')).toBeRequired();
    expect(screen.getByLabelText(/^Mobile number/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Last name/)).not.toBeRequired();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('refuses an empty first name and focuses it', async () => {
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fillSlot();
    await user.click(confirmButton());
    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription(/first name/i);
    expect(screen.getByLabelText(/^Mobile number/)).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });

  it('refuses an invalid phone number', async () => {
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fill({ 'First name': 'Giulia', 'Mobile number (optional)': '12' });
    await fillSlot();
    await user.click(confirmButton());
    expect(screen.getByLabelText(/^Mobile number/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Mobile number/)).toHaveAccessibleDescription(/valid mobile number/);
    await waitFor(() => expect(screen.getByLabelText(/^Mobile number/)).toHaveFocus());
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });

  it('books with a first name and a phone', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking({ hiker: GIULIA }));
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fill({ 'First name': 'Giulia ', 'Mobile number (optional)': '3337654321' });
    await fillSlot({ partySize: '4' });
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(JSON.parse(JSON.stringify(sentBody()))).toEqual({
      temporaryHiker: { firstName: 'Giulia', phone: '+393337654321' },
      slotId: 23,
      partySize: 4,
    });
  });

  it('sends no phone when it was typed and then cleared', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking({ hiker: GIULIA }));
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fill({ 'First name': 'Giulia', 'Mobile number (optional)': '333' });
    await user.clear(screen.getByLabelText(/^Mobile number/));
    await fillSlot({ partySize: '2' });
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(JSON.parse(JSON.stringify(sentBody()))).toEqual({
      temporaryHiker: { firstName: 'Giulia' },
      slotId: 23,
      partySize: 2,
    });
  });
});

// --- R6 -------------------------------------------------------------------------------------------------

describe('R6 the request', () => {
  const whoKeys = (body) => ['hikerId', 'newHiker', 'temporaryHiker'].filter((k) => body[k] !== undefined);

  it('has only the hiker of the mode shown, even after typing in the other modes', async () => {
    vi.mocked(staffApi.searchHikers).mockResolvedValue([MARCO]);
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await fill(NEW_HIKER);
    await chooseMode('Quick entry');
    await fill({ 'First name': 'Giulia' });
    await chooseExisting(MARCO);
    await fillSlot();
    await user.click(confirmButton());

    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(whoKeys(sentBody())).toEqual(['hikerId']);
    expect(sentBody()).toMatchObject({ hikerId: 4 });
  });

  it('has slotId and partySize as numbers, whatever the mode', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking({ hiker: GIULIA }));
    renderStaff();
    await heading();
    await chooseExisting(MARCO);
    await chooseMode('Quick entry');
    await fill({ 'First name': 'Giulia' });
    await fillSlot({ partySize: '12' });
    await user.click(confirmButton());

    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    const body = sentBody();
    expect(whoKeys(body)).toEqual(['temporaryHiker']);
    expect(body.slotId).toBe(23);
    expect(body.partySize).toBe(12);
    expect(staffApi.createStaffBooking).toHaveBeenCalledTimes(1);
  });
});

// --- R7 -------------------------------------------------------------------------------------------------

describe('R7 slots for staff', () => {
  it('lets staff choose a slot starting in less than 2 hours; a started or full slot is disabled', async () => {
    renderStaff();
    await heading();
    await user.type(screen.getByLabelText('Date'), TODAY);
    await waitFor(() => expect(timeMenu()).toBeEnabled());

    const option = (name) => within(timeMenu()).getByRole('option', { name });
    expect(option(LUNCH)).toBeEnabled();
    expect(option(DINNER)).toBeEnabled();
    expect(option('Breakfast, 08:00 – 09:30 – started')).toBeDisabled();
    expect(option('Tea, 16:00 – 17:00 – full')).toBeDisabled();
    expect(timeMenu()).toHaveAccessibleDescription(/started/);
    expect(timeMenu()).not.toHaveAccessibleDescription(/2 hours/);
  });

  it('books the slot starting in 1 h 30 for a hiker', async () => {
    renderStaff();
    await heading();
    await chooseExisting(MARCO);
    await fillSlot({ time: LUNCH, partySize: '2' });
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(sentBody()).toMatchObject({ slotId: 21, partySize: 2 });
  });

  it('a slot is "started" from its start time on (at 19:00 the dinner cannot be chosen any more)', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 19, 0));
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(
      SLOTS.map((s) => ({ ...s, bookingState: s.bookingState === 'full' ? 'full' : 'tooLate' })),
    );
    renderStaff();
    await heading();
    await user.type(screen.getByLabelText('Date'), TODAY);
    await waitFor(() => expect(timeMenu()).toBeEnabled());
    expect(within(timeMenu()).getByRole('option', { name: `${DINNER} – started` })).toBeDisabled();
  });

  it('the Book page of a hiker keeps the 2-hour rule', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderPage(<BookPage />, { path: '/book', guard: <RequireRole roles={['hiker']} /> });
    await screen.findByRole('heading', { level: 1, name: 'Book a table' });
    await user.type(screen.getByLabelText('Date'), TODAY);
    await waitFor(() => expect(timeMenu()).toBeEnabled());
    expect(within(timeMenu()).getByRole('option', { name: `${LUNCH} – booking closed` })).toBeDisabled();
    expect(timeMenu()).toHaveAccessibleDescription(/2 hours/);
    expect(bookingsApi.createBooking).not.toHaveBeenCalled();
  });
});

// --- R8 -------------------------------------------------------------------------------------------------

describe('R8 empty submit', () => {
  it('shows an error on every field, focuses the first one and sends nothing', async () => {
    renderStaff();
    await heading();
    await chooseMode('Existing hiker');
    await user.click(confirmButton());

    expect(searchBox()).toHaveAttribute('aria-invalid', 'true');
    expect(searchBox()).toHaveAccessibleDescription(/choose|search/i);
    expect(screen.getByLabelText('Date')).toHaveAttribute('aria-invalid', 'true');
    expect(timeMenu()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Number of people')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(searchBox()).toHaveFocus());
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });

  it('with only the hiker missing, focuses the hiker field', async () => {
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fillSlot();
    await user.click(confirmButton());
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
    expect(screen.getByLabelText('Date')).not.toHaveAttribute('aria-invalid');
  });

  it('does not leave the errors of one mode under the fields of another', async () => {
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await user.click(confirmButton());
    expect(screen.getByLabelText('First name')).toHaveAttribute('aria-invalid', 'true');

    await chooseMode('Quick entry');
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/^Mobile number/)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Date')).toHaveAttribute('aria-invalid', 'true'); // the table part is the same
  });

  it('checks a field again when it is left: the error goes once it is fixed', async () => {
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await user.click(confirmButton());

    for (const [label, text] of Object.entries(NEW_HIKER)) {
      await user.click(screen.getByLabelText(label));
      await user.paste(text);
      await user.tab();
      expect(screen.getByLabelText(label), label).not.toHaveAttribute('aria-invalid');
    }
    await user.type(screen.getByLabelText('Date'), TODAY);
    await user.tab();
    expect(screen.getByLabelText('Date')).not.toHaveAttribute('aria-invalid');

    await chooseMode('Quick entry');
    await user.click(confirmButton());
    await user.click(screen.getByLabelText('First name'));
    await user.paste('Giulia');
    await user.tab();
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-invalid');

    await chooseMode('Existing hiker');
    await user.click(confirmButton());
    await user.click(searchBox());
    await user.tab();
    expect(searchBox()).toHaveAttribute('aria-invalid', 'true'); // still no hiker chosen
  });
});

// --- R9 -------------------------------------------------------------------------------------------------

describe('R9 server refusals', () => {
  async function bookAs(mode) {
    if (mode === 'existing') await chooseExisting(MARCO);
    if (mode === 'new') {
      await chooseMode('New hiker');
      await fill(NEW_HIKER);
    }
    if (mode === 'quick') {
      await chooseMode('Quick entry');
      await fill({ 'First name': 'Giulia' });
    }
    await fillSlot();
    await user.click(confirmButton());
  }

  it.each([
    ['new', new ApiError(409, 'Email already in use'), () => screen.getByLabelText('Email')],
    ['existing', new ApiError(404, 'Hiker not found'), () => searchBox()],
    ['quick', new ApiError(409, 'Not enough seats available for this party'), () => timeMenu()],
    ['existing', new ApiError(409, 'This hiker already has a booking for this slot'), () => timeMenu()],
    ['new', new ApiError(400, 'This slot has already started'), () => timeMenu()],
  ])('%s hiker, "%s": the message is on its field, which gets the focus', async (mode, error, field) => {
    vi.mocked(staffApi.createStaffBooking).mockRejectedValue(error);
    renderStaff();
    await heading();
    await bookAs(mode);

    await waitFor(() => expect(field()).toHaveAttribute('aria-invalid', 'true'));
    expect(field()).toHaveAccessibleDescription(expect.stringContaining(error.message));
    await waitFor(() => expect(field()).toHaveFocus());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reservation confirmed' })).not.toBeInTheDocument();
  });

  it.each([
    ['an unknown slot', new ApiError(404, 'Slot not found')],
    ['an invalid body', new ApiError(400, 'Give exactly one of hikerId, newHiker or temporaryHiker')],
    ['a lost session', new ApiError(401, 'Not logged in')],
    ['no connection', new ApiError(0, 'Cannot reach the server.')],
  ])('%s: the message above the form, with the focus on it', async (_what, error) => {
    vi.mocked(staffApi.createStaffBooking).mockRejectedValue(error);
    renderStaff();
    await heading();
    await bookAs('quick');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(error.message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(timeMenu()).not.toHaveAttribute('aria-invalid');
    expect(confirmButton()).toBeEnabled(); // can try again
  });

  it('sends one request at a time (a second submit while booking is ignored)', async () => {
    let finish;
    vi.mocked(staffApi.createStaffBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderStaff();
    await heading();
    await bookAs('quick');
    const busy = screen.getByRole('button', { name: 'Booking…' });
    expect(busy).toBeDisabled();
    fireEvent.submit(busy.closest('form'));
    expect(staffApi.createStaffBooking).toHaveBeenCalledTimes(1);
    finish(staffBooking({ hiker: GIULIA }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' })).toBeInTheDocument();
  });
});

// --- R10 ------------------------------------------------------------------------------------------------

describe('R10 party requirements', () => {
  const addButton = () => screen.getByRole('button', { name: /Add/ });
  const description = (n) => screen.getByLabelText(`Description for requirement ${n}`);

  async function addRequirements(list) {
    for (const [i, { hasAllergies, description: text }] of list.entries()) {
      await user.click(addButton());
      await user.type(description(i + 1), text);
      if (hasAllergies) await user.click(screen.getAllByRole('checkbox', { name: /Allergies/ })[i]);
    }
  }

  it('offers the optional editor of the Book page and sends the requirements in order', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking({ requirements: PO_REQUIREMENTS }));
    renderStaff();
    await heading();
    expect(screen.getByRole('group', { name: /Dietary needs and allergies/ })).toBeInTheDocument();
    await chooseExisting(MARCO);
    await fillSlot();
    await addRequirements(PO_REQUIREMENTS);
    await user.click(confirmButton());

    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(sentBody()).toEqual({ hikerId: 4, slotId: 23, partySize: 6, requirements: PO_REQUIREMENTS });
  });

  it('sends no requirements when there are none (also after adding and removing one)', async () => {
    renderStaff();
    await heading();
    await chooseExisting(MARCO);
    await fillSlot();
    await user.click(addButton());
    await user.click(screen.getByRole('button', { name: 'Remove requirement 1' }));
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(sentBody()).not.toHaveProperty('requirements');
  });

  it('does not book with an empty description: the error is on it and it gets the focus', async () => {
    renderStaff();
    await heading();
    await chooseExisting(MARCO);
    await fillSlot();
    await user.click(addButton());
    await user.click(confirmButton());

    expect(description(1)).toHaveAttribute('aria-invalid', 'true');
    expect(description(1)).toHaveAccessibleDescription('Enter a description for requirement 1.');
    await waitFor(() => expect(description(1)).toHaveFocus());
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });

  it('with a hiker field missing too, focuses the hiker field first', async () => {
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fillSlot();
    await user.click(addButton());
    await user.click(confirmButton());
    expect(description(1)).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
    expect(staffApi.createStaffBooking).not.toHaveBeenCalled();
  });
});

// --- R11 ------------------------------------------------------------------------------------------------

describe('R11 confirmation', () => {
  const passwordRegion = () => screen.queryByRole('region', { name: /password/i });

  async function bookNewHiker() {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(
      staffBooking({
        hiker: { id: 30, firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com',
          phone: '+39 333 5551234', temporary: false },
        generatedPassword: PASSWORD,
      }),
    );
    renderStaff();
    await heading();
    await chooseMode('New hiker');
    await fill(NEW_HIKER);
    await fillSlot();
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
  }

  it('existing hiker: who, date, time, party, seat split (no table names), requirements; no password', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking({ requirements: PO_REQUIREMENTS }));
    renderStaff();
    await heading();
    await chooseExisting(MARCO);
    await fillSlot();
    await user.click(confirmButton());

    expect(await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Reservation confirmed – Mountain Hut'));
    const main = document.body;
    expect(main).toHaveTextContent('Marco Rossi');
    expect(main).toHaveTextContent('Tue 3 Nov');
    expect(main).toHaveTextContent(DINNER);
    expect(main).toHaveTextContent('6 people');
    expect(main).toHaveTextContent('4 + 2 seats');
    expect(main).not.toHaveTextContent(/\bT[35]\b/);
    const requirements = screen.getByRole('region', { name: 'Dietary needs and allergies' });
    expect(within(requirements).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Allergies1 vegan, peanut allergy',
      'Diet2 vegetarians',
    ]);
    expect(passwordRegion()).not.toBeInTheDocument();
    expect(main).not.toHaveTextContent(/password/i);
  });

  it('temporary hiker: marked as temporary, no password', async () => {
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking({ hiker: GIULIA }));
    renderStaff();
    await heading();
    await chooseMode('Quick entry');
    await fill({ 'First name': 'Giulia' });
    await fillSlot();
    await user.click(confirmButton());

    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(document.body).toHaveTextContent(/Giulia.*temporary/i);
    expect(passwordRegion()).not.toBeInTheDocument();
  });

  it('new hiker: shows the generated password, to give to the hiker', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    await bookNewHiker();
    const region = passwordRegion();
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent(PASSWORD);
    expect(document.body).toHaveTextContent('Paolo Neri');
  });

  it('"Copy password" copies it and says "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await bookNewHiker();
    await userEvent.click(within(passwordRegion()).getByRole('button', { name: 'Copy password' }));
    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    await waitFor(() => expect(statusTexts()).toContain('Copied'));
  });

  it('says so when the copy fails (e.g. the browser refuses), and does not say "Copied"', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    await bookNewHiker();
    await userEvent.click(within(passwordRegion()).getByRole('button', { name: 'Copy password' }));
    await pause(50);
    expect(statusTexts()).not.toContain('Copied');
    const messages = [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    expect(messages.some((text) => /cop/i.test(text))).toBe(true);
  });

  it('without the Clipboard API (e.g. not https) the password is still shown', async () => {
    setClipboard(undefined);
    await bookNewHiker();
    expect(passwordRegion()).toHaveTextContent(PASSWORD);
  });

  it('"New reservation" starts again from an empty form, and the password is not shown again', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    await bookNewHiker();
    await user.click(screen.getByRole('button', { name: 'New reservation' }));

    expect(await heading()).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(PASSWORD);
    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByLabelText('Number of people')).toHaveValue(null);
    expect(screen.queryAllByLabelText(/Description for requirement/)).toHaveLength(0);
    // The hiker part is empty too, whatever the mode shown.
    await chooseMode('New hiker');
    expect(screen.getByLabelText('First name')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-invalid');
    await chooseMode('Existing hiker');
    expect(searchBox()).toHaveValue('');

    // The next reservation, for an existing hiker, shows no password.
    vi.mocked(staffApi.createStaffBooking).mockResolvedValue(staffBooking());
    await chooseExisting(MARCO);
    await fillSlot();
    await user.click(confirmButton());
    await screen.findByRole('heading', { level: 1, name: 'Reservation confirmed' });
    expect(passwordRegion()).not.toBeInTheDocument();
  });
});
