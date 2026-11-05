// Edge cases of the Check availability page (MH-04 FE1), next to the contract in CheckAvailabilityPage.test.jsx:
// the slot line when the slot list cannot be read, and answers that arrive after the form has changed.
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
const SLOTS = [{ id: 5, label: 'Dinner', startTime: '19:00', endTime: '20:30', bookingState: 'bookable' }];
const AVAILABLE = { available: true, split: [{ slotTableId: 10, tableName: 'T1', seats: 4 }] };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Opens the page, fills dinner on DATE for 4 people and clicks Check. */
async function check() {
  renderPage(<CheckAvailabilityPage />, { path: '/availability' });
  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: DATE } });
  const time = screen.getByLabelText('Time');
  await waitFor(() => expect(time).toBeEnabled());
  await userEvent.selectOptions(time, screen.getByRole('option', { name: 'Dinner, 19:00 – 20:30' }));
  await userEvent.type(screen.getByLabelText('Number of people'), '4');
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
}

const resultRegion = () => screen.getAllByRole('status').find((el) => /Available|Not available/.test(el.textContent));

describe('CheckAvailabilityPage – edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  it('shows the answer without the slot line when the slot list cannot be read at check time', async () => {
    // First call: the SlotPicker list; second call: the one made by Check.
    vi.mocked(publicSlotsApi.listPublicSlots)
      .mockResolvedValueOnce(SLOTS)
      .mockRejectedValueOnce(new ApiError(0, 'Cannot reach the server.'));
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue(AVAILABLE);
    await check();
    await waitFor(() => expect(resultRegion()).toHaveTextContent('Available for 4 people'));
    expect(resultRegion()).not.toHaveTextContent('Dinner');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the answer without the slot line when the slot is no longer in the list', async () => {
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValueOnce(SLOTS).mockResolvedValueOnce([]);
    vi.mocked(availabilityApi.checkAvailability).mockResolvedValue(AVAILABLE);
    await check();
    await waitFor(() => expect(resultRegion()).toHaveTextContent('Available for 4 people'));
    expect(resultRegion()).not.toHaveTextContent('Dinner');
  });

  it('ignores an answer that arrives after the form has changed', async () => {
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
    const answer = deferred();
    vi.mocked(availabilityApi.checkAvailability).mockReturnValue(answer.promise);
    await check();
    await userEvent.type(screen.getByLabelText('Number of people'), '0'); // 40 people now
    answer.resolve(AVAILABLE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled());
    expect(resultRegion()).toBeUndefined();
  });

  it('ignores an error that arrives after the form has changed', async () => {
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue(SLOTS);
    const answer = deferred();
    vi.mocked(availabilityApi.checkAvailability).mockReturnValue(answer.promise);
    await check();
    await userEvent.type(screen.getByLabelText('Number of people'), '0');
    answer.reject(new ApiError(500, 'Something went wrong.'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
