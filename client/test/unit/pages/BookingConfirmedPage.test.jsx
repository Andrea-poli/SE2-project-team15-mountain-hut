import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as bookingsApi from '../../../src/api/bookings.js';
import { ApiError } from '../../../src/api/client.js';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import BookingConfirmedPage from '../../../src/pages/hiker/BookingConfirmedPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/bookings.js', () => ({ createBooking: vi.fn(), getBooking: vi.fn() }));

// A booking as the server returns it (openapi Booking): table names included, never shown.
const BOOKING = {
  id: 7,
  slot: { id: 21, date: '2026-11-03', startTime: '19:00', endTime: '20:30', label: 'Dinner – 1st turn' },
  partySize: 3,
  tables: [{ slotTableId: 91, tableName: 'T1', seats: 3 }],
  status: 'confirmed',
  createdAt: '2026-11-02T09:00:00.000Z',
};

function renderConfirmed(url = '/bookings/7') {
  renderPage(<BookingConfirmedPage />, { path: '/bookings/:id', url, guard: <RequireRole roles={['hiker']} /> });
}

/** Text of the <dd> that follows the <dt> named `term`. */
const detail = (term) => screen.getByText(term, { selector: 'dt' }).nextElementSibling;

describe('BookingConfirmedPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(hiker);
  });

  it('shows a loading message while the booking is read', async () => {
    let finish;
    vi.mocked(bookingsApi.getBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderConfirmed();
    await waitFor(() => expect(bookingsApi.getBooking).toHaveBeenCalledWith('7'));
    expect(bookingsApi.getBooking).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    finish(BOOKING);
    expect(await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeInTheDocument();
  });

  it('shows the booked slot, the party and the seat split', async () => {
    vi.mocked(bookingsApi.getBooking).mockResolvedValue(BOOKING);
    renderConfirmed();
    expect(await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Booking confirmed – Mountain Hut'));
    expect(screen.getByRole('status')).toHaveTextContent('Your table is booked. See you at the hut!');
    expect(detail('Date')).toHaveTextContent(/^Tue 3 Nov$/);
    expect(detail('Time')).toHaveTextContent(/^Dinner – 1st turn, 19:00 – 20:30$/);
    expect(detail('Party')).toHaveTextContent(/^3 people$/);
    expect(detail('Seating')).toHaveTextContent(/^3 seats at one table$/);
    expect(document.body).not.toHaveTextContent(/T1/);
  });

  it('shows the split over several tables, never the table names', async () => {
    vi.mocked(bookingsApi.getBooking).mockResolvedValue({
      ...BOOKING,
      partySize: 10,
      tables: [
        { slotTableId: 91, tableName: 'T1', seats: 2 },
        { slotTableId: 95, tableName: 'T5', seats: 8 },
      ],
    });
    renderConfirmed();
    await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' });
    expect(detail('Party')).toHaveTextContent(/^10 people$/);
    expect(detail('Seating')).toHaveTextContent(/^2 \+ 8 seats$/);
    expect(document.body).not.toHaveTextContent(/T1|T5/);
  });

  it('shows only the time of a slot without a label, and "1 person"', async () => {
    vi.mocked(bookingsApi.getBooking).mockResolvedValue({
      ...BOOKING,
      slot: { ...BOOKING.slot, date: '2026-11-06', startTime: '12:00', endTime: '14:00', label: '' },
      partySize: 1,
      tables: [{ slotTableId: 80, tableName: 'T2', seats: 1 }],
    });
    renderConfirmed();
    await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' });
    expect(detail('Date')).toHaveTextContent(/^Fri 6 Nov$/);
    expect(detail('Time')).toHaveTextContent(/^12:00 – 14:00$/);
    expect(detail('Party')).toHaveTextContent(/^1 person$/);
    expect(detail('Seating')).toHaveTextContent(/^1 seat at one table$/);
  });

  it.each([
    [404, 'Booking not found', '/bookings/7'],
    [400, 'id must be a positive integer', '/bookings/abc'],
  ])('a %i says the booking does not exist or is not yours', async (status, message, url) => {
    vi.mocked(bookingsApi.getBooking).mockRejectedValue(new ApiError(status, message));
    renderConfirmed(url);
    expect(await screen.findByRole('heading', { level: 1, name: 'Booking not found' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This booking does not exist or is not yours.');
    expect(screen.getByRole('link', { name: 'Book a table' })).toHaveAttribute('href', '/book');
    await waitFor(() => expect(document.title).toBe('Booking not found – Mountain Hut'));
    expect(screen.getByRole('alert')).not.toHaveTextContent(message); // the page text, not the server's
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    [500, 'Something went wrong. Please try again.'],
    [0, 'Cannot reach the server.'],
  ])('another error (%i) shows the server message', async (status, message) => {
    vi.mocked(bookingsApi.getBooking).mockRejectedValue(new ApiError(status, message));
    renderConfirmed();
    expect(await screen.findByRole('heading', { level: 1, name: 'Booking' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('link', { name: 'Book a table' })).toHaveAttribute('href', '/book');
    expect(screen.queryByText('This booking does not exist or is not yours.')).not.toBeInTheDocument();
  });

  describe('the "email sent" line (MH-03)', () => {
    it('names the email of the logged-in hiker', async () => {
      // An address found nowhere else (not in BOOKING, not in the users helper): only user.email can produce it.
      const email = 'ottavia.pellegrini@example.org';
      vi.mocked(authApi.me).mockResolvedValue({ ...hiker, email });
      vi.mocked(bookingsApi.getBooking).mockResolvedValue(BOOKING);
      renderConfirmed();
      await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' });
      expect(screen.getByText(/has been sent to/)).toHaveTextContent(
        /^A confirmation email has been sent to ottavia\.pellegrini@example\.org\.$/,
      );
    });

    it.each([null, ''])('is not shown when the hiker has no email (%j)', async (email) => {
      vi.mocked(authApi.me).mockResolvedValue({ ...hiker, email });
      vi.mocked(bookingsApi.getBooking).mockResolvedValue(BOOKING);
      renderConfirmed();
      await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' });
      expect(document.body).not.toHaveTextContent(/has been sent/);
    });

    it.each([
      [404, 'Booking not found', 'Booking not found'],
      [500, 'Something went wrong. Please try again.', 'Booking'],
    ])('is not shown when the booking cannot be read (%i)', async (status, message, heading) => {
      vi.mocked(bookingsApi.getBooking).mockRejectedValue(new ApiError(status, message));
      renderConfirmed();
      await screen.findByRole('heading', { level: 1, name: heading });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/has been sent/);
    });
  });
});
