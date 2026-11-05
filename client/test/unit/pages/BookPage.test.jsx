import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as bookingsApi from '../../../src/api/bookings.js';
import { ApiError } from '../../../src/api/client.js';
import * as publicSlotsApi from '../../../src/api/publicSlots.js';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import BookPage from '../../../src/pages/hiker/BookPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/publicSlots.js', () => ({ listPublicSlots: vi.fn() }));
vi.mock('../../../src/api/bookings.js', () => ({ createBooking: vi.fn(), getBooking: vi.fn() }));

const TIME_HELP = 'Full slots and slots starting in less than 2 hours cannot be chosen.';
const SLOTS = [
  { id: 10, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' },
  { id: 11, label: 'Dinner – 1st turn', startTime: '19:00', endTime: '20:30', bookingState: 'bookable' },
];
const booking = (id) => ({ id, slot: { id: 10, date: '2026-11-06' }, partySize: 3, tables: [], status: 'confirmed' });

function renderBook(url = '/book') {
  renderPage(<BookPage />, { path: '/book', url, guard: <RequireRole roles={['hiker']} /> });
}

const timeMenu = () => screen.getByRole('combobox', { name: 'Time' });
const confirmButton = () => screen.getByRole('button', { name: 'Confirm booking' });

/** Fills the form like a hiker: date, then a time once the slots are there, then the party size. */
async function fill({ date = '2026-11-06', time = 'Lunch, 12:00 – 14:00', partySize = '3' } = {}) {
  await screen.findByRole('heading', { level: 1, name: 'Book a table' });
  await userEvent.type(screen.getByLabelText('Date'), date);
  await waitFor(() => expect(timeMenu()).toBeEnabled());
  await userEvent.selectOptions(timeMenu(), time);
  await userEvent.type(screen.getByLabelText('Number of people'), partySize);
}

describe('BookPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Only the date is fixed (min of the date field): timers stay real for userEvent and waitFor.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 10, 0));
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the booking form to a hiker, with title and the 2-hour rule', async () => {
    renderBook();
    expect(await screen.findByRole('heading', { level: 1, name: 'Book a table' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Book a table – Mountain Hut'));
    expect(screen.getByText('Bookings close 2 hours before the meal starts.')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveAttribute('min', '2026-11-03');
    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('prefills the form from the URL', async () => {
    renderBook('/book?date=2026-11-06&slotId=11&partySize=4');
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-11-06');
    await waitFor(() => expect(timeMenu()).toHaveValue('11'));
    expect(publicSlotsApi.listPublicSlots).toHaveBeenCalledWith('2026-11-06');
    expect(screen.getByLabelText('Number of people')).toHaveValue(4);
  });

  it('on an empty submit shows the three errors, focuses Date and books nothing', async () => {
    renderBook();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));

    const date = screen.getByLabelText('Date');
    expect(date).toHaveAccessibleDescription('Choose a date.');
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(timeMenu()).toHaveAccessibleDescription(`Choose a time. ${TIME_HELP}`);
    expect(timeMenu()).toHaveAttribute('aria-invalid', 'true');
    const party = screen.getByLabelText('Number of people');
    expect(party).toHaveAccessibleDescription('Enter the number of people, at least 1. Everyone in your party, you included.');
    expect(party).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(date).toHaveFocus());
    expect(bookingsApi.createBooking).not.toHaveBeenCalled();
  });

  it('removes a field error on blur once the field is fixed, and keeps the others', async () => {
    renderBook();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    const date = screen.getByLabelText('Date');
    await userEvent.type(date, '2026-11-06');
    await userEvent.tab();
    expect(date).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Choose a date.')).not.toBeInTheDocument();
    expect(screen.getByText('Choose a time.')).toBeInTheDocument();

    const party = screen.getByLabelText('Number of people');
    await userEvent.type(party, '0');
    await userEvent.tab();
    expect(party).toHaveAccessibleDescription(/^Enter the number of people, at least 1\./);
    await userEvent.clear(party);
    await userEvent.type(party, '2');
    await userEvent.tab();
    expect(party).not.toHaveAttribute('aria-invalid');
  });

  it('books with numbers and goes to the confirmation of the new booking', async () => {
    vi.mocked(bookingsApi.createBooking).mockResolvedValue(booking(7));
    renderBook();
    await fill({ partySize: '3' });
    await userEvent.click(confirmButton());
    expect(await screen.findByText('Landed on /bookings/7')).toBeInTheDocument();
    expect(bookingsApi.createBooking).toHaveBeenCalledTimes(1);
    expect(bookingsApi.createBooking).toHaveBeenCalledWith({ slotId: 10, partySize: 3 });
  });

  it('disables the button while booking, so a second click books nothing more', async () => {
    let finish;
    vi.mocked(bookingsApi.createBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBook();
    await fill();
    await userEvent.click(confirmButton());
    const busy = screen.getByRole('button', { name: 'Booking…' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(bookingsApi.createBooking).toHaveBeenCalledTimes(1);
    finish(booking(7));
    expect(await screen.findByText('Landed on /bookings/7')).toBeInTheDocument();
    expect(bookingsApi.createBooking).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, 'You already have a booking for this slot'],
    [409, 'Not enough seats available for this party'],
    [400, 'Bookings are accepted up to 2 hours before the slot starts'],
    [400, 'This slot is closed'],
  ])('shows a %i "%s" under Time and focuses it', async (status, message) => {
    vi.mocked(bookingsApi.createBooking).mockRejectedValue(new ApiError(status, message));
    renderBook();
    await fill();
    await userEvent.click(confirmButton());

    const expected = `${message}. Choose another time.`;
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(timeMenu()).toHaveAccessibleDescription(`${expected} ${TIME_HELP}`);
    expect(timeMenu()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(timeMenu()).toHaveFocus());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Book a table' })).toBeInTheDocument();
    expect(screen.queryByText(/^Landed on/)).not.toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it.each([
    [404, 'Slot not found'],
    [0, 'Cannot reach the server.'],
    [500, 'Something went wrong. Please try again.'],
  ])('shows a %i "%s" above the form and focuses it', async (status, message) => {
    vi.mocked(bookingsApi.createBooking).mockRejectedValue(new ApiError(status, message));
    renderBook();
    await fill();
    await userEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(timeMenu()).not.toHaveAttribute('aria-invalid');
    expect(timeMenu()).toHaveValue('10');
    expect(screen.getByRole('heading', { level: 1, name: 'Book a table' })).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('after an error the hiker can try again, and the old messages go away', async () => {
    vi.mocked(bookingsApi.createBooking)
      .mockRejectedValueOnce(new ApiError(0, 'Cannot reach the server.'))
      .mockRejectedValueOnce(new ApiError(409, 'Not enough seats available for this party'))
      .mockResolvedValueOnce(booking(8));
    renderBook();
    await fill();

    await userEvent.click(confirmButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');

    await userEvent.click(confirmButton());
    expect(await screen.findByText('Not enough seats available for this party. Choose another time.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.selectOptions(timeMenu(), 'Dinner – 1st turn, 19:00 – 20:30');
    await userEvent.click(confirmButton());
    expect(await screen.findByText('Landed on /bookings/8')).toBeInTheDocument();
    expect(bookingsApi.createBooking).toHaveBeenCalledTimes(3);
    expect(bookingsApi.createBooking).toHaveBeenLastCalledWith({ slotId: 11, partySize: 3 });
  });
});
