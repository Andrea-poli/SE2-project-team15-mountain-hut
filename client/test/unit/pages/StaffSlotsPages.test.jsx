// MH-02 FT1 – unit tests of the staff slot pages (SlotsWeekPage + NewSlotPage, tasks MH-02 FE1 and FE2).
// Written before the pages, from MH-02 (PO clarifications), docs/openapi.yaml (tag slots) and the plan:
// these tests are the agreed CONTRACT the pages are built to pass. Behaviour only – roles, labels,
// visible text – never markup or classes: layout, styling and extra wording are free.
//
// THE CONTRACT
//  API  client/src/api/slots.js exports listSlots(from, to) → Slot[] and createSlot(newSlot) → Slot
//       (GET/POST /api/slots, openapi Slot / NewSlot). Times 'HH:MM', dates 'YYYY-MM-DD'.
//
//  Week view – routes.staffSlots ('/staff/slots'), employee and warden (RequireRole already in App.jsx)
//  W1  <h1> "Slots of the week". Loads listSlots(monday, sunday) of the current week (Mon–Sun, hut time).
//  W2  One region per day (<section> with a heading), 7 in order Mon→Sun; the heading contains the day as
//      formatDate gives it (e.g. "Mon 2 Nov"). Today's section has aria-current="date".
//  W3  Each slot of a day shows its label and time range (formatTimeRange) inside that day's section.
//  W4  A slot is a button (its accessible name contains the label); activating it shows its tables
//      ("T1 – 4 seats" style: name and seats) inside the same day, and aria-expanded tells the state.
//  W5  Buttons "Previous week" / "Next week" load the week before / after (listSlots called again).
//  W6  One link "New slot" at the top (outside the days, also in an empty week) → routes.newSlot; and in each
//      day from today on a link "Add slot" → routes.newSlot?date=<that day> (form prefilled). Past days: none.
//      (team decision 4 Nov, group chat: "both")
//  W7  A day without slots says "No slots"; a load error is shown in a role="alert".
//  W8  The week is in the URL (?week=<Monday>, a wrong value → the current week); a "Today" button brings
//      back the current week. A slot that has started (past: true, or a past day) shows "Past".
//
//  New slot form – routes.newSlot ('/staff/slots/new'), employee and warden
//  N1  <h1> "New slot". Fields labelled "Date", "Start time", "End time", "Label"; one row per table with
//      fields labelled "Table name" and "Seats" (one row at the start); buttons "Add table", and
//      "Remove table" per row (not shown, or disabled, when only one row is left).
//  N2  "Total capacity: N seats" updates with the rows.
//  N3  A select "Copy tables from" lists the slots of ±15 days (from listSlots) and replaces the rows
//      with the chosen slot's tables.
//  N4  Submit button "Create slot". Client checks before calling the API, errors next to the field:
//      empty label → on "Label"; end not after start → on "End time"; duplicated table names → on the
//      second "Table name"; seats < 1 → on that "Seats". createSlot is not called then.
//  N5  Valid form → createSlot({date, startTime, endTime, label, tables:[{name, seats(number)}]}),
//      then back to the week view (routes.staffSlots, ?date= of the new slot is welcome but optional).
//  N6  Server 409 → "Overlaps an existing slot" shown (alert or on a time field); other errors in an alert.
//  N7  A slot that has already started is refused on "Start time", a slot on a past day on "Date".
//      After creating, the week view says "Slot created: <label>, <date>, <time>" (role="status"),
//      and the message can be closed.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import * as slotsApi from '../../../src/api/slots.js';
import { AuthProvider } from '../../../src/auth/AuthContext.jsx';
import NewSlotPage from '../../../src/pages/staff/NewSlotPage.jsx';
import SlotsWeekPage from '../../../src/pages/staff/SlotsWeekPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/slots.js', () => ({ listSlots: vi.fn(), createSlot: vi.fn() }));

// "Now": Wednesday 4 November 2026, 10:00 in the hut → the current week is Mon 2 – Sun 8 Nov.
const NOW = new Date(2026, 10, 4, 10, 0);

const slot = (over) => ({
  id: 1,
  date: '2026-11-04',
  startTime: '19:00',
  endTime: '20:30',
  label: 'Dinner',
  status: 'open',
  past: false,
  tables: [
    { id: 11, name: 'T1', seats: 4 },
    { id: 12, name: 'T2', seats: 6 },
  ],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true, toFake: ['Date'] });
  vi.mocked(authApi.me).mockResolvedValue(employee);
  vi.mocked(slotsApi.listSlots).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------- week view

describe('SlotsWeekPage (MH-02 FE1)', () => {
  const renderWeek = () => renderPage(<SlotsWeekPage />, { path: '/staff/slots' });
  const days = () => screen.getAllByRole('region');

  it('W1: loads the slots of the current week, Monday to Sunday', async () => {
    renderWeek();
    expect(await screen.findByRole('heading', { level: 1, name: 'Slots of the week' })).toBeInTheDocument();
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenCalledWith('2026-11-02', '2026-11-08'));
  });

  it('W2: shows the seven days in order, today marked', async () => {
    renderWeek();
    await waitFor(() => expect(days()).toHaveLength(7));
    const names = ['Mon 2 Nov', 'Tue 3 Nov', 'Wed 4 Nov', 'Thu 5 Nov', 'Fri 6 Nov', 'Sat 7 Nov', 'Sun 8 Nov'];
    days().forEach((day, i) => expect(within(day).getByRole('heading')).toHaveTextContent(names[i]));
    expect(days()[2]).toHaveAttribute('aria-current', 'date');
    expect(days().filter((d) => d.getAttribute('aria-current') === 'date')).toHaveLength(1);
  });

  it('W3/W7: each slot appears in its own day; empty days say "No slots"', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([
      slot({ id: 1, date: '2026-11-04', label: 'Dinner', startTime: '19:00', endTime: '20:30' }),
      slot({ id: 2, date: '2026-11-06', label: 'Lunch', startTime: '12:00', endTime: '14:00' }),
    ]);
    renderWeek();
    await screen.findByText(/Dinner/);
    const [mon, , wed, , fri] = days();
    expect(within(wed).getByText(/Dinner/)).toBeInTheDocument();
    expect(within(wed).getByText(/19:00 – 20:30/)).toBeInTheDocument();
    expect(within(fri).getByText(/Lunch/)).toBeInTheDocument();
    expect(within(mon).getByText('No slots')).toBeInTheDocument();
  });

  it('W4: a slot opens in place and shows its tables', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([slot()]);
    renderWeek();
    const button = await screen.findByRole('button', { name: /Dinner/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/T2/)).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const wed = days()[2];
    expect(within(wed).getByText(/T1/)).toHaveTextContent(/T1\D+4 seats?\b/);
    expect(within(wed).getByText(/T2/)).toHaveTextContent(/T2\D+6 seats?\b/);
  });

  it('W5: the arrows load the previous and the next week', async () => {
    renderWeek();
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenCalledWith('2026-11-02', '2026-11-08'));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-09', '2026-11-15'));
    expect(within(days()[0]).getByRole('heading')).toHaveTextContent('Mon 9 Nov');
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-10-26', '2026-11-01'));
  });

  it('W8: the week in the URL is shown; a wrong value shows the current week', async () => {
    renderPage(<SlotsWeekPage />, { path: '/staff/slots', url: '/staff/slots?week=2026-11-30' });
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenCalledWith('2026-11-30', '2026-12-06'));
    await waitFor(() => expect(within(days()[0]).getByRole('heading')).toHaveTextContent('Mon 30 Nov'));
  });

  it.each(['abc', '2026-02-30'])('W8: ?week=%s shows the current week', async (week) => {
    renderPage(<SlotsWeekPage />, { path: '/staff/slots', url: `/staff/slots?week=${week}` });
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenCalledWith('2026-11-02', '2026-11-08'));
    await waitFor(() => expect(within(days()[0]).getByRole('heading')).toHaveTextContent('Mon 2 Nov'));
  });

  it('W8: "Today" brings back the current week', async () => {
    renderWeek();
    await waitFor(() => expect(days()).toHaveLength(7));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-16', '2026-11-22'));

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-02', '2026-11-08'));
    await waitFor(() => expect(within(days()[0]).getByRole('heading')).toHaveTextContent('Mon 2 Nov'));
  });

  it('W8: a slot that has started shows "Past", a future one does not', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([
      slot({ id: 1, date: '2026-11-04', label: 'Breakfast', startTime: '08:00', endTime: '09:30', past: true }),
      slot({ id: 2, date: '2026-11-04', label: 'Dinner', startTime: '19:00', endTime: '20:30', past: false }),
    ]);
    renderWeek();
    expect(await screen.findByRole('button', { name: /Breakfast/ })).toHaveTextContent(/Past/);
    expect(screen.getByRole('button', { name: /Dinner/ })).not.toHaveTextContent(/Past/);
  });

  it('W6: one "New slot" link at the top (also in an empty week) leads to the form', async () => {
    renderWeek();
    const top = await screen.findByRole('link', { name: /^New slot$/i });
    expect(top).toHaveAttribute('href', '/staff/slots/new');
    expect(days().some((day) => day.contains(top))).toBe(false); // not inside a day
  });

  it('W6: each day from today on has "Add slot" with that date prefilled; past days have none', async () => {
    renderWeek();
    await waitFor(() => expect(days()).toHaveLength(7));
    // Now = Wed 4 Nov: Mon 2 and Tue 3 are past, Wed 4 – Sun 8 can get a new slot.
    const [mon, tue, ...fromToday] = days();
    expect(within(mon).queryByRole('link', { name: /Add slot/ })).not.toBeInTheDocument();
    expect(within(tue).queryByRole('link', { name: /Add slot/ })).not.toBeInTheDocument();
    const dates = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    fromToday.forEach((day, i) => {
      const link = within(day).getByRole('link', { name: /Add slot/ });
      expect(link).toHaveAttribute('href', `/staff/slots/new?date=${dates[i]}`);
    });
  });

  it('W7: a load error is shown in an alert', async () => {
    vi.mocked(slotsApi.listSlots).mockRejectedValue(new ApiError(500, 'Something went wrong, please try again'));
    renderWeek();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong, please try again');
  });
});

// ---------------------------------------------------------------- new slot form

describe('NewSlotPage (MH-02 FE2)', () => {
  const renderForm = () => renderPage(<NewSlotPage />, { path: '/staff/slots/new' });
  const tableNames = () => screen.getAllByLabelText('Table name');
  const seatFields = () => screen.getAllByLabelText('Seats');

  async function fillValid({ date = '2026-11-05', start = '19:00', end = '20:30', label = 'Dinner' } = {}) {
    await screen.findByRole('heading', { level: 1, name: 'New slot' });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: start } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: end } });
    const labelField = screen.getByLabelText('Label');
    await userEvent.clear(labelField);
    if (label) await userEvent.type(labelField, label);
    await userEvent.clear(tableNames()[0]);
    await userEvent.type(tableNames()[0], 'T1');
    await userEvent.clear(seatFields()[0]);
    await userEvent.type(seatFields()[0], '4');
  }

  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create slot' }));

  it('N1: has the slot fields and one table row to start', async () => {
    renderForm();
    expect(await screen.findByRole('heading', { level: 1, name: 'New slot' })).toBeInTheDocument();
    for (const label of ['Date', 'Start time', 'End time', 'Label']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(tableNames()).toHaveLength(1);
    expect(seatFields()).toHaveLength(1);
  });

  it('N1/N2: tables can be added and removed, and the total capacity follows', async () => {
    renderForm();
    await fillValid();
    expect(screen.getByText(/Total capacity: 4 seats/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add table' }));
    expect(tableNames()).toHaveLength(2);
    await userEvent.type(tableNames()[1], 'T2');
    await userEvent.type(seatFields()[1], '6');
    expect(screen.getByText(/Total capacity: 10 seats/)).toBeInTheDocument();

    const removeButtons = screen.getAllByRole('button', { name: /Remove table/ });
    await userEvent.click(removeButtons[0]);
    expect(tableNames()).toHaveLength(1);
    expect(tableNames()[0]).toHaveValue('T2');
    expect(screen.getByText(/Total capacity: 6 seats/)).toBeInTheDocument();
    const lastRemove = screen.queryByRole('button', { name: /Remove table/ });
    if (lastRemove) expect(lastRemove).toBeDisabled(); // a slot keeps at least one table
  });

  it('N3: "Copy tables from" loads nearby slots and copies their tables', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([
      slot({ id: 7, date: '2026-11-03', label: 'Big dinner', tables: [
        { id: 1, name: 'A', seats: 8 },
        { id: 2, name: 'B', seats: 2 },
      ] }),
    ]);
    renderForm();
    await screen.findByRole('heading', { level: 1, name: 'New slot' });
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenCalledWith('2026-10-20', '2026-11-19'));

    const copy = screen.getByLabelText('Copy tables from');
    await waitFor(() => expect(within(copy).getByRole('option', { name: /Big dinner/ })).toBeInTheDocument());
    await userEvent.selectOptions(copy, within(copy).getByRole('option', { name: /Big dinner/ }));

    expect(tableNames().map((f) => f.value)).toEqual(['A', 'B']);
    expect(seatFields().map((f) => f.value)).toEqual(['8', '2']);
    expect(screen.getByText(/Total capacity: 10 seats/)).toBeInTheDocument();
  });

  it('N4: client checks put each error next to its field and do not call the server', async () => {
    renderForm();
    await fillValid({ start: '20:00', end: '19:00', label: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Add table' }));
    await userEvent.type(tableNames()[1], 'T1'); // same name as the first row
    await userEvent.type(seatFields()[1], '0');
    await submit();

    expect(screen.getByLabelText('Label')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true');
    expect(tableNames()[1]).toHaveAttribute('aria-invalid', 'true');
    expect(seatFields()[1]).toHaveAttribute('aria-invalid', 'true');
    expect(tableNames()[0]).not.toHaveAttribute('aria-invalid', 'true');
    expect(slotsApi.createSlot).not.toHaveBeenCalled();
  });

  it('N5: a valid form creates the slot with numeric seats, then returns to the week view', async () => {
    vi.mocked(slotsApi.createSlot).mockResolvedValue(slot({ id: 99, date: '2026-11-05' }));
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Add table' }));
    await userEvent.type(tableNames()[1], 'T2');
    await userEvent.type(seatFields()[1], '6');
    await submit();

    expect(slotsApi.createSlot).toHaveBeenCalledWith({
      date: '2026-11-05',
      startTime: '19:00',
      endTime: '20:30',
      label: 'Dinner',
      tables: [
        { name: 'T1', seats: 4 },
        { name: 'T2', seats: 6 },
      ],
    });
    expect(await screen.findByText(/^Landed on \/staff\/slots(\?|$)/)).toBeInTheDocument();
  });

  it('N7: a slot that has already started is refused on "Start time"; one later today is accepted', async () => {
    vi.mocked(slotsApi.createSlot).mockResolvedValue(slot({ id: 99, date: '2026-11-04' }));
    renderForm();
    // Now = Wed 4 Nov, 10:00.
    await fillValid({ date: '2026-11-04', start: '09:00', end: '09:30' });
    await submit();
    expect(screen.getByLabelText('Start time')).toHaveAttribute('aria-invalid', 'true');
    expect(slotsApi.createSlot).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '11:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } });
    await submit();
    expect(slotsApi.createSlot).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-04', startTime: '11:00' }));
  });

  it('N7: a slot on a past day is refused on "Date", not on "Start time"', async () => {
    renderForm();
    // Now = Wed 4 Nov, 10:00: Monday 2 Nov is a past day.
    await fillValid({ date: '2026-11-02', start: '12:00', end: '13:00' });
    await submit();
    expect(screen.getByLabelText('Date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Date')).toHaveAccessibleDescription(/The date cannot be in the past/);
    expect(screen.getByLabelText('Start time')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Date')).toHaveFocus();
    expect(slotsApi.createSlot).not.toHaveBeenCalled();
  });

  it('N7: after creating, the week view says "Slot created" with the slot, and the message can be closed', async () => {
    const created = slot({ id: 99, date: '2026-11-05', label: 'Dinner', startTime: '19:00', endTime: '20:30' });
    vi.mocked(slotsApi.createSlot).mockResolvedValue(created);
    // Both pages, as in App.jsx: the form goes back to the real week view.
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/staff/slots/new']}>
          <Routes>
            <Route path="/staff/slots/new" element={<NewSlotPage />} />
            <Route path="/staff/slots" element={<SlotsWeekPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    await fillValid();
    vi.mocked(slotsApi.listSlots).mockResolvedValue([created]);
    await submit();

    const message = await screen.findByText(/^Slot created:/);
    expect(message).toHaveTextContent('Slot created: Dinner, Thu 5 Nov, 19:00 – 20:30');
    expect(message.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Slots of the week' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText(/^Slot created:/)).not.toBeInTheDocument();
  });

  it('N6: an overlap refused by the server (409) is shown to the employee', async () => {
    vi.mocked(slotsApi.createSlot).mockRejectedValue(new ApiError(409, 'Overlaps an existing slot'));
    renderForm();
    await fillValid();
    await submit();
    expect(await screen.findByText(/Overlaps an existing slot/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'New slot' })).toBeInTheDocument(); // stays on the form
  });

  it('N6: other server errors are shown in an alert', async () => {
    vi.mocked(slotsApi.createSlot).mockRejectedValue(new ApiError(500, 'Something went wrong, please try again'));
    renderForm();
    await fillValid();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong, please try again');
  });
});
