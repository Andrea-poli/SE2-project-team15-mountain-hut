// MH-05 FT1 – the Book page with party requirements (MH-05 FE1), written from the story (PO issues #4, #29) and
// the contract (POST /api/bookings { slotId, partySize, requirements? }): requirements are optional, sent only
// when there are some; an empty description stops the booking, with the error on that field.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as bookingsApi from '../../../src/api/bookings.js';
import * as publicSlotsApi from '../../../src/api/publicSlots.js';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import BookPage from '../../../src/pages/hiker/BookPage.jsx';
import BookingConfirmedPage from '../../../src/pages/hiker/BookingConfirmedPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/publicSlots.js', () => ({ listPublicSlots: vi.fn() }));
vi.mock('../../../src/api/bookings.js', () => ({ createBooking: vi.fn(), getBooking: vi.fn() }));

// The example of the PO (MH-05 clarifications): three requirements, two with allergies.
const PO_EXAMPLE = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: true, description: '1 shellfish allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];
const SLOTS = [{ id: 10, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' }];
const BOOKING = {
  id: 7,
  slot: { id: 10, date: '2026-11-06', startTime: '12:00', endTime: '14:00', label: 'Lunch' },
  partySize: 7,
  tables: [{ slotTableId: 1, tableName: 'T5', seats: 7 }],
  requirements: PO_EXAMPLE,
  status: 'confirmed',
  createdAt: '2026-11-03T09:00:00.000Z',
};

const timeMenu = () => screen.getByRole('combobox', { name: 'Time' });
const confirmButton = () => screen.getByRole('button', { name: 'Confirm booking' });
const addButton = () => screen.getByRole('button', { name: /Add/ });
const description = (n) => screen.getByLabelText(`Description for requirement ${n}`);

function renderBook() {
  renderPage(<BookPage />, { path: '/book', guard: <RequireRole roles={['hiker']} /> });
}

async function fillSlot({ partySize = '7' } = {}) {
  await screen.findByRole('heading', { level: 1, name: 'Book a table' });
  await userEvent.type(screen.getByLabelText('Date'), '2026-11-06');
  await waitFor(() => expect(timeMenu()).toBeEnabled());
  await userEvent.selectOptions(timeMenu(), 'Lunch, 12:00 – 14:00');
  await userEvent.type(screen.getByLabelText('Number of people'), partySize);
}

async function addRequirements(list) {
  for (const { hasAllergies, description: text } of list) {
    await userEvent.click(addButton());
    const n = screen.getAllByRole('textbox').length;
    await userEvent.type(description(n), text);
    if (hasAllergies) await userEvent.click(screen.getAllByRole('checkbox', { name: /Allergies/ })[n - 1]);
  }
}

describe('BookPage with party requirements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 10, 0));
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
    vi.mocked(bookingsApi.createBooking).mockResolvedValue(BOOKING);
  });
  afterEach(() => vi.useRealTimers());

  it('offers the optional requirements editor in the booking form', async () => {
    renderBook();
    expect(await screen.findByRole('group', { name: /Dietary needs and allergies/ })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('books the PO example: three requirements, two with allergies, in the order entered', async () => {
    renderBook();
    await fillSlot();
    await addRequirements(PO_EXAMPLE);
    await userEvent.click(confirmButton());

    expect(await screen.findByText('Landed on /bookings/7')).toBeInTheDocument();
    expect(bookingsApi.createBooking).toHaveBeenCalledWith({ slotId: 10, partySize: 7, requirements: PO_EXAMPLE });
  });

  it('sends no requirements when there are none (also after adding and removing one)', async () => {
    renderBook();
    await fillSlot({ partySize: '2' });
    await userEvent.click(addButton());
    await userEvent.click(screen.getByRole('button', { name: 'Remove requirement 1' }));
    await userEvent.click(confirmButton());

    expect(await screen.findByText('Landed on /bookings/7')).toBeInTheDocument();
    expect(bookingsApi.createBooking).toHaveBeenCalledWith({ slotId: 10, partySize: 2 });
  });

  it('does not book with an empty description: the error is on it and it gets the focus', async () => {
    renderBook();
    await fillSlot();
    await addRequirements([PO_EXAMPLE[0]]);
    await userEvent.click(addButton()); // a second requirement left empty
    await userEvent.click(confirmButton());

    expect(description(2)).toHaveAttribute('aria-invalid', 'true');
    expect(description(2)).toHaveAccessibleDescription('Enter a description for requirement 2.');
    await waitFor(() => expect(description(2)).toHaveFocus());
    expect(description(1)).not.toHaveAttribute('aria-invalid');
    expect(bookingsApi.createBooking).not.toHaveBeenCalled();

    await userEvent.type(description(2), '2 vegetarians');
    await userEvent.click(confirmButton());
    expect(await screen.findByText('Landed on /bookings/7')).toBeInTheDocument();
  });

  it('with the slot fields missing too, shows both errors and focuses the first slot field', async () => {
    renderBook();
    await screen.findByRole('heading', { level: 1, name: 'Book a table' });
    await userEvent.click(addButton());
    await userEvent.click(confirmButton());

    expect(screen.getByLabelText('Date')).toHaveAttribute('aria-invalid', 'true');
    expect(description(1)).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveFocus());
    expect(bookingsApi.createBooking).not.toHaveBeenCalled();
  });

  it('ignores a second submit (e.g. Enter in a field) while the booking is being sent', async () => {
    let finish;
    vi.mocked(bookingsApi.createBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBook();
    await fillSlot();
    await userEvent.click(confirmButton());
    fireEvent.submit(screen.getByRole('button', { name: 'Booking…' }).closest('form'));
    expect(bookingsApi.createBooking).toHaveBeenCalledTimes(1);
    finish(BOOKING);
    expect(await screen.findByText('Landed on /bookings/7')).toBeInTheDocument();
  });
});

describe('BookingConfirmedPage with party requirements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(hiker);
  });

  it('shows the requirements of the booking, the allergies marked', async () => {
    vi.mocked(bookingsApi.getBooking).mockResolvedValue(BOOKING);
    renderPage(<BookingConfirmedPage />, { path: '/bookings/:id', url: '/bookings/7' });

    const section = await screen.findByRole('region', { name: 'Dietary needs and allergies' });
    expect([...section.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Allergies1 vegan, peanut allergy',
      'Allergies1 shellfish allergy',
      'Diet2 vegetarians',
    ]);
  });

  it.each([
    ['an empty list', { ...BOOKING, requirements: [] }],
    ['no requirements field (older answer)', (({ requirements: _r, ...rest }) => rest)(BOOKING)],
  ])('shows no requirements section for %s', async (_what, booking) => {
    vi.mocked(bookingsApi.getBooking).mockResolvedValue(booking);
    renderPage(<BookingConfirmedPage />, { path: '/bookings/:id', url: '/bookings/7' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dietary needs and allergies' })).not.toBeInTheDocument();
  });
});
