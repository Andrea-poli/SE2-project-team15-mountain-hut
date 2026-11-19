// MH-08 FT1 – unit tests of "Cancel booking" in My bookings (MyBookingsPage + CancelBookingDialog, MH-08 FE1).
// Written from MH-08 (clarification: no time constraints, PO issue #8), the contract (POST /api/bookings/{id}/cancel
// → 200 Booking with status cancelled and tables [] | 404 | 409 "This booking is already cancelled") and the task:
// "Cancel asks for confirmation; Keep it changes nothing; after cancelling, the booking shows as cancelled".
// Behaviour only: roles, labels, visible text and focus, never markup or classes.
//
//  K1  "Cancel booking" on every confirmed booking that has not started, also inside the 48 hours (when it can no
//      longer be changed); none on cancelled or past bookings.
//  K2  It asks first: a dialog "Cancel this booking?" with the date, time and party; the focus is on "Keep it".
//  K3  "Keep it", Escape and the close button change nothing: no request, the booking as it was, the focus back.
//  K4  "Yes, cancel booking" → cancelBooking(id); the card says "Cancelled" (no Change, no Cancel), the list is read
//      again, "Booking cancelled" appears with the focus. Closing it moves the focus to the heading.
//  K5  While cancelling nothing closes the dialog and the buttons are disabled.
//  K6  409 / 404: the message in the dialog (focused), no new try, the list is read again; any other error can be
//      tried again.
//  K7  A click that reaches "Yes, cancel booking" while it is disabled (cancelling, or after a 409) sends nothing.
//  The seats freed in Check availability are checked end to end in e2e/cancelBooking.spec.js (real server).
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as bookingsApi from '../../../src/api/bookings.js';
import { ApiError } from '../../../src/api/client.js';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import MyBookingsPage from '../../../src/pages/hiker/MyBookingsPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { booking, CANCELLED, NOW, PAST, SOON, UPCOMING } from '../../helpers/myBookings.js';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/bookings.js', () => ({
  createBooking: vi.fn(), getBooking: vi.fn(), listMyBookings: vi.fn(), changeBooking: vi.fn(), cancelBooking: vi.fn(),
}));

// The bookings (helpers/myBookings.js): SOON, Wed 4 Nov, is less than 48 h away (no Change, but it can still be
// cancelled: no time constraints); UPCOMING, Tue 10 Nov; CANCELLED; PAST, Wed 28 Oct.
// What the server answers for UPCOMING once cancelled (contract: status cancelled, tables []).
const UPCOMING_CANCELLED = { ...UPCOMING, status: 'cancelled', tables: [], changeable: false };

const MY_BOOKINGS = '/my-bookings';
function renderList(url = MY_BOOKINGS) {
  renderPage(<MyBookingsPage />, { path: MY_BOOKINGS, url, guard: <RequireRole roles={['hiker']} /> });
}
const heading = () => screen.findByRole('heading', { level: 1, name: 'My bookings' });
/** The card of the booking whose date is `date` (e.g. "Tue 10 Nov"), once the list is there. */
const card = async (date) => {
  await heading();
  return waitFor(() => {
    const found = screen.getAllByRole('listitem').find((li) => li.textContent.includes(date));
    expect(found).toBeTruthy();
    return found;
  });
};
const cancelButtonOf = (item) => within(item).getByRole('button', { name: 'Cancel booking' });
const dialog = () => screen.getByRole('dialog', { name: 'Cancel this booking?' });
const yes = () => within(dialog()).getByRole('button', { name: /^(Yes, cancel booking|Cancelling…)$/ });
const keepIt = () => within(dialog()).getByRole('button', { name: 'Keep it' });

/**
 * Runs the button's click handler even while the button is disabled, as a click arriving before React has
 * re-rendered would (a disabled button gets no click from userEvent or fireEvent). Test only: it reads the props
 * React keeps on the element.
 */
function clickEvenIfDisabled(button) {
  const propsKey = Object.keys(button).find((key) => key.startsWith('__reactProps$'));
  act(() => {
    button[propsKey].onClick();
  });
}

/** Opens the dialog of the booking on `date`; returns its card. */
async function openDialog(date = 'Tue 10 Nov') {
  const item = await card(date);
  await userEvent.click(cancelButtonOf(item));
  expect(dialog()).toBeInTheDocument();
  return item;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(authApi.me).mockResolvedValue(hiker);
  vi.mocked(bookingsApi.listMyBookings).mockResolvedValue([SOON, UPCOMING, CANCELLED, PAST]);
  vi.mocked(bookingsApi.cancelBooking).mockResolvedValue(UPCOMING_CANCELLED);
});
afterEach(() => vi.useRealTimers());

describe('K1: which bookings can be cancelled', () => {
  it('confirmed bookings not started yet, also inside the 48 hours; not cancelled or past ones', async () => {
    renderList();
    expect(cancelButtonOf(await card('Tue 10 Nov'))).toBeInTheDocument();
    const soon = await card('Wed 4 Nov');
    expect(cancelButtonOf(soon)).toBeInTheDocument();
    expect(within(soon).queryByRole('link', { name: 'Change' })).not.toBeInTheDocument();

    const [, , cancelled, past] = screen.getAllByRole('listitem');
    expect(within(cancelled).queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
    expect(within(past).queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
  });

  it('each "Cancel booking" says which booking it is for', async () => {
    renderList();
    expect(cancelButtonOf(await card('Tue 10 Nov'))).toHaveAccessibleDescription(/Tue 10 Nov.*12:00 – 14:00/);
  });
});

describe('K2–K3: it asks first, and "Keep it" changes nothing', () => {
  it('a slot without a label shows only its time in the dialog', async () => {
    const noLabel = booking({ slot: { ...UPCOMING.slot, label: '' } });
    vi.mocked(bookingsApi.listMyBookings).mockResolvedValue([noLabel]);
    renderList();
    await openDialog();
    expect(dialog()).toHaveTextContent('12:00 – 14:00');
    expect(dialog()).not.toHaveTextContent('Lunch');
  });

  it('shows the booking in a dialog, with the focus on "Keep it"', async () => {
    renderList();
    await openDialog();

    expect(dialog()).toHaveTextContent('Tue 10 Nov');
    expect(dialog()).toHaveTextContent('Lunch, 12:00 – 14:00');
    expect(dialog()).toHaveTextContent('3 people');
    expect(dialog()).toHaveTextContent(/cannot be undone/);
    expect(keepIt()).toHaveFocus();
    expect(bookingsApi.cancelBooking).not.toHaveBeenCalled();
  });

  it.each([
    ['"Keep it"', () => userEvent.click(keepIt())],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    ['the close button', () => userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))],
  ])('%s closes the dialog: no request, the booking as it was, the focus back on its button', async (_how, close) => {
    renderList();
    const item = await openDialog();

    await close();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bookingsApi.cancelBooking).not.toHaveBeenCalled();
    expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(1);
    expect(item).not.toHaveTextContent('Cancelled');
    expect(within(item).getByRole('link', { name: 'Change' })).toBeInTheDocument();
    await waitFor(() => expect(cancelButtonOf(item)).toHaveFocus());
    expect(screen.queryByText(/Booking cancelled/)).not.toBeInTheDocument();
  });
});

describe('K4: after the cancel', () => {
  it('the card says Cancelled at once, the list is read again, and "Booking cancelled" gets the focus', async () => {
    renderList();
    const item = await openDialog();
    vi.mocked(bookingsApi.listMyBookings).mockResolvedValue([SOON, UPCOMING_CANCELLED, CANCELLED, PAST]);

    await userEvent.click(yes());

    expect(bookingsApi.cancelBooking).toHaveBeenCalledExactlyOnceWith(7);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const message = screen.getByText('Booking cancelled. We sent you an email.').closest('[role="status"]');
    await waitFor(() => expect(message).toHaveFocus());
    expect(item).toHaveTextContent('Cancelled');
    expect(within(item).queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
    expect(within(item).queryByRole('link', { name: 'Change' })).not.toBeInTheDocument();
    await waitFor(() => expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(2));
    // The other bookings are as they were.
    expect(cancelButtonOf(await card('Wed 4 Nov'))).toBeInTheDocument();
  });

  it('closing "Booking cancelled" moves the focus to the page heading', async () => {
    renderList();
    await openDialog();
    await userEvent.click(yes());
    const message = screen.getByText('Booking cancelled. We sent you an email.').closest('[role="status"]');

    await userEvent.click(within(message).getByRole('button', { name: 'Close' }));

    expect(screen.queryByText(/Booking cancelled/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'My bookings' })).toHaveFocus());
  });

  it('if reading the list again fails, the list on screen stays (the cancel is done)', async () => {
    renderList();
    const item = await openDialog();
    vi.mocked(bookingsApi.listMyBookings).mockRejectedValue(new ApiError(500, 'Server error'));

    await userEvent.click(yes());

    await waitFor(() => expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(2));
    expect(item).toHaveTextContent('Cancelled');
    expect(screen.getByText('Booking cancelled. We sent you an email.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('after a change, only one message at a time: "Booking cancelled" replaces "Booking changed"', async () => {
    renderList({ pathname: MY_BOOKINGS, state: { bookingChanged: true, bookingId: 7 } });
    expect(await screen.findByText(/Booking changed/)).toBeInTheDocument();
    await openDialog();

    await userEvent.click(yes());

    expect(await screen.findByText('Booking cancelled. We sent you an email.')).toBeInTheDocument();
    expect(screen.queryByText(/Booking changed/)).not.toBeInTheDocument();
  });
});

describe('K5: while cancelling', () => {
  it('the buttons are disabled and nothing closes the dialog, then it goes on', async () => {
    let finish;
    vi.mocked(bookingsApi.cancelBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderList();
    await openDialog();

    await userEvent.click(yes());

    expect(yes()).toHaveTextContent('Cancelling…');
    expect(yes()).toBeDisabled();
    expect(keepIt()).toBeDisabled();
    expect(within(dialog()).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();
    expect(bookingsApi.cancelBooking).toHaveBeenCalledTimes(1);

    finish(UPCOMING_CANCELLED);
    expect(await screen.findByText('Booking cancelled. We sent you an email.')).toBeInTheDocument();
  });
});

describe('K6: errors', () => {
  it.each([
    [409, 'This booking is already cancelled'],
    [404, 'Booking not found'],
  ])('%i: the message in the dialog, no new try, the list read again', async (status, text) => {
    renderList();
    await openDialog();
    vi.mocked(bookingsApi.cancelBooking).mockRejectedValue(new ApiError(status, text));
    vi.mocked(bookingsApi.listMyBookings).mockResolvedValue([SOON, UPCOMING_CANCELLED, CANCELLED, PAST]);

    await userEvent.click(yes());

    const error = within(dialog()).getByRole('alert');
    expect(error).toHaveTextContent(text);
    await waitFor(() => expect(error).toHaveFocus());
    expect(yes()).toBeDisabled();
    expect(keepIt()).toBeEnabled();
    await waitFor(() => expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Booking cancelled/)).not.toBeInTheDocument();
  });

  it('409, then "Keep it": the list read again shows it Cancelled, and the focus goes to the heading', async () => {
    renderList();
    const item = await openDialog();
    vi.mocked(bookingsApi.cancelBooking).mockRejectedValue(new ApiError(409, 'This booking is already cancelled'));
    vi.mocked(bookingsApi.listMyBookings).mockResolvedValue([SOON, UPCOMING_CANCELLED, CANCELLED, PAST]);
    await userEvent.click(yes());
    await waitFor(() => expect(item).toHaveTextContent('Cancelled'));

    await userEvent.click(keepIt());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'My bookings' })).toHaveFocus());
  });

  it('any other error can be tried again, and the second try cancels', async () => {
    renderList();
    await openDialog();
    vi.mocked(bookingsApi.cancelBooking)
      .mockRejectedValueOnce(new ApiError(500, 'Something went wrong'))
      .mockResolvedValueOnce(UPCOMING_CANCELLED);

    await userEvent.click(yes());

    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(yes()).toBeEnabled();
    expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(1);

    await userEvent.click(yes());
    expect(await screen.findByText('Booking cancelled. We sent you an email.')).toBeInTheDocument();
    expect(bookingsApi.cancelBooking).toHaveBeenCalledTimes(2);
  });
});

describe('K7: a click on the disabled button', () => {
  it('while cancelling sends nothing more', async () => {
    let finish;
    vi.mocked(bookingsApi.cancelBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderList();
    await openDialog();
    await userEvent.click(yes());
    expect(yes()).toBeDisabled();

    clickEvenIfDisabled(yes());

    expect(bookingsApi.cancelBooking).toHaveBeenCalledTimes(1);
    finish(UPCOMING_CANCELLED); // the dialog closes, as after any cancel
    expect(await screen.findByText('Booking cancelled. We sent you an email.')).toBeInTheDocument();
  });

  it('after a 409 sends nothing more', async () => {
    renderList();
    await openDialog();
    vi.mocked(bookingsApi.cancelBooking).mockRejectedValue(new ApiError(409, 'This booking is already cancelled'));
    await userEvent.click(yes());
    await waitFor(() => expect(yes()).toBeDisabled());

    clickEvenIfDisabled(yes());

    expect(bookingsApi.cancelBooking).toHaveBeenCalledTimes(1);
  });
});
