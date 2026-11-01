// MH-04 FT1 – unit tests of the Check availability page (CheckAvailabilityPage, task MH-04 FE1).
// Written before the page, from MH-04 (PO issue #12), docs/openapi.yaml and the plan (MH-04 FE1/FT1):
// these tests are the agreed CONTRACT the page is built to pass. They check behaviour only, the way a
// user (or a screen reader) finds things – by role, label and visible text – never by markup or classes.
//
// THE CONTRACT (layout, styling and extra wording are free):
//  C1  Page at routes.checkAvailability ('/availability'), public (no login). <h1> "Check availability",
//      <title> "Check availability – Mountain Hut".
//  C2  Uses the shared SlotPicker (MH-01 FE1): fields labelled "Date", "Time", "Number of people".
//  C3  A button named "Check", disabled until the three fields are valid (isSlotPickerComplete).
//  C4  Check calls checkAvailability(slotId, partySize) exported by client/src/api/availability.js
//      (GET /api/public/slots/{id}/availability?partySize=), with numbers. Button disabled while waiting.
//  C5  Available → a role="status" region (live, announced) containing "Available" and the seat split
//      joined with " + " (e.g. "2 + 3 + 1 seats"). Never table names (openapi Allocation).
//  C6  Available → a link named "Book this table" to /book with date, slotId and partySize in the query
//      (slotPickerValueToParams), so the Book page opens prefilled.
//  C7  Not available → the status region contains "Not available"; no "Book this table" link and
//      no alternative slots suggested (PO).
//  C8  Server error → the message in a role="alert"; no result shown.
//  C9  Changing any field after a result removes the result (it no longer matches the form).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as availabilityApi from '../../../src/api/availability.js';
import { ApiError } from '../../../src/api/client.js';
import * as publicSlotsApi from '../../../src/api/publicSlots.js';
import CheckAvailabilityPage from '../../../src/pages/public/CheckAvailabilityPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/publicSlots.js', () => ({ listPublicSlots: vi.fn() }));
vi.mock('../../../src/api/availability.js', () => ({ checkAvailability: vi.fn() }));

const DATE = '2026-11-03';
const SLOTS = [
  { id: 4, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' },
  { id: 5, label: 'Dinner', startTime: '19:00', endTime: '20:30', bookingState: 'bookable' },
];
const split = (...seats) => seats.map((n, i) => ({ slotTableId: 10 + i, tableName: `T${i + 1}`, seats: n }));

function renderCheck() {
  renderPage(<CheckAvailabilityPage />, { path: '/availability' });
}

/** Fills date, time and party size through the SlotPicker, as a user would. */
async function fill({ date = DATE, time = 'Dinner, 19:00 – 20:30', people = '6' } = {}) {
  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: date } });
  const timeSelect = screen.getByLabelText('Time');
  await waitFor(() => expect(timeSelect).toBeEnabled());
  await userEvent.selectOptions(timeSelect, screen.getByRole('option', { name: time }));
  const party = screen.getByLabelText('Number of people');
  await userEvent.clear(party);
  if (people) await userEvent.type(party, people);
}

const checkButton = () => screen.getByRole('button', { name: 'Check' });

/** The status region holding the result (Loading also uses role="status", so pick it by its text). */
async function resultStatus(text) {
  return waitFor(() => {
    const region = screen.getAllByRole('status').find((el) => text.test(el.textContent));
    expect(region, `a role="status" region matching ${text}`).toBeDefined();
    return region;
  });
}

describe('CheckAvailabilityPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in')); // a guest
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
  });

  it('C1/C2: is public, with its heading and the three slot fields', async () => {
    renderCheck();
    expect(await screen.findByRole('heading', { level: 1, name: 'Check availability' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
    expect(screen.getByLabelText('Number of people')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Check availability – Mountain Hut'));
  });

  it('C3: Check is disabled until date, time and party size are all valid', async () => {
    renderCheck();
    await screen.findByRole('heading', { level: 1, name: 'Check availability' });
    expect(checkButton()).toBeDisabled();
    await fill({ people: '' });
    expect(checkButton()).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Number of people'), '0');
    expect(checkButton()).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Number of people'));
    await userEvent.type(screen.getByLabelText('Number of people'), '6');
    expect(checkButton()).toBeEnabled();
  });

  it('C4: checks the chosen slot and party size, with numbers', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue({ available: true, split: split(6) });
    renderCheck();
    await fill();
    await userEvent.click(checkButton());
    expect(availabilityApi.checkAvailability).toHaveBeenCalledWith(5, 6);
  });

  it('C4: the button is disabled while the check is running', async () => {
    let answer;
    vi.mocked(availabilityApi.checkAvailability).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderCheck();
    await fill();
    await userEvent.click(checkButton());
    expect(screen.getByRole('button', { name: /check/i })).toBeDisabled();
    answer({ available: true, split: split(6) });
    await screen.findByText(/Available/);
  });

  it('C5: available → announced status with the seat split, no table names', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue({ available: true, split: split(2, 3, 1) });
    renderCheck();
    await fill();
    await userEvent.click(checkButton());

    const region = await resultStatus(/Available/);
    expect(region).toHaveTextContent('2 + 3 + 1 seats');
    expect(screen.queryByText(/\bT[123]\b/)).not.toBeInTheDocument();
  });

  it('C6: available → "Book this table" opens the Book page prefilled', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue({ available: true, split: split(6) });
    renderCheck();
    await fill();
    await userEvent.click(checkButton());

    const link = await screen.findByRole('link', { name: 'Book this table' });
    const url = new URL(link.getAttribute('href'), 'http://localhost');
    expect(url.pathname).toBe('/book');
    expect(Object.fromEntries(url.searchParams)).toEqual({ date: DATE, slotId: '5', partySize: '6' });
  });

  it('C7: not available → says so, with no booking link and no alternative slots', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue({ available: false, split: [] });
    renderCheck();
    await fill({ people: '30' });
    await userEvent.click(checkButton());

    await resultStatus(/Not available/);
    expect(screen.queryByRole('link', { name: 'Book this table' })).not.toBeInTheDocument();
    // No suggestions: the only slot list ever loaded is the one of the chosen day.
    expect(publicSlotsApi.listPublicSlots).toHaveBeenCalledWith(DATE);
    expect(new Set(vi.mocked(publicSlotsApi.listPublicSlots).mock.calls.map(([d]) => d))).toEqual(new Set([DATE]));
  });

  it('C8: a server error is shown in an alert, without a result', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockRejectedValue(new ApiError(404, 'Slot not found'));
    renderCheck();
    await fill();
    await userEvent.click(checkButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Slot not found');
    expect(screen.queryByText(/Available/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Book this table' })).not.toBeInTheDocument();
  });

  it('C9: changing the party size after a result removes the result', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue({ available: true, split: split(6) });
    renderCheck();
    await fill();
    await userEvent.click(checkButton());
    await screen.findByRole('link', { name: 'Book this table' });

    await userEvent.type(screen.getByLabelText('Number of people'), '0'); // 6 → 60
    expect(screen.queryByRole('link', { name: 'Book this table' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Available/)).not.toBeInTheDocument();
  });

  it('C9: choosing another day removes the result too', async () => {
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue({ available: false, split: [] });
    renderCheck();
    await fill();
    await userEvent.click(checkButton());
    await resultStatus(/Not available/);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-04' } });
    await waitFor(() => expect(screen.queryByText(/Not available/)).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Book this table' })).not.toBeInTheDocument();
  });
});
