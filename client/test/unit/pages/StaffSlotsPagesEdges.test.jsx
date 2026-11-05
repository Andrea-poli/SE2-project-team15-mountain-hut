// Edge cases of the staff slot pages (MH-02 FE1/FE2), next to the contract in StaffSlotsPages.test.jsx:
// answers that arrive too late, errors while the form is being corrected, Cancel and the slot toggle.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import * as slotsApi from '../../../src/api/slots.js';
import NewSlotPage from '../../../src/pages/staff/NewSlotPage.jsx';
import SlotsWeekPage from '../../../src/pages/staff/SlotsWeekPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/slots.js', () => ({ listSlots: vi.fn(), createSlot: vi.fn() }));

// "Now": Wednesday 4 November 2026, 10:00 in the hut, as in the contract tests.
const NOW = new Date(2026, 10, 4, 10, 0);

const slot = (over) => ({
  id: 1,
  date: '2026-11-04',
  startTime: '19:00',
  endTime: '20:30',
  label: 'Dinner',
  status: 'open',
  past: false,
  tables: [{ id: 11, name: 'T1', seats: 4 }],
  ...over,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true, toFake: ['Date'] });
  vi.mocked(authApi.me).mockResolvedValue(employee);
  vi.mocked(slotsApi.listSlots).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('SlotsWeekPage – edge cases', () => {
  const renderWeek = () => renderPage(<SlotsWeekPage />, { path: '/staff/slots' });

  it.each([
    ['an answer', (first) => first.resolve([slot({ label: 'Old week dinner' })])],
    ['an error', (first) => first.reject(new ApiError(500, 'Old week failed.'))],
  ])('ignores %s for a week that is no longer shown', async (_what, settle) => {
    const first = deferred();
    vi.mocked(slotsApi.listSlots).mockReturnValueOnce(first.promise).mockResolvedValue([]);
    renderWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-09', '2026-11-15'));
    expect((await screen.findAllByText('No slots')).length).toBe(7);
    settle(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getAllByText('No slots')).toHaveLength(7); // the new week stays on screen
    expect(screen.queryByText(/Old week/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clicking an open slot again closes it', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([slot()]);
    renderWeek();
    const button = await screen.findByRole('button', { name: /Dinner/ });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/T1/)).not.toBeInTheDocument();
  });
});

describe('NewSlotPage – edge cases', () => {
  const renderForm = (url = '/staff/slots/new') => renderPage(<NewSlotPage />, { path: '/staff/slots/new', url });
  const tableNames = () => screen.getAllByLabelText('Table name');
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create slot' }));
  const errorOf = (field) => field.getAttribute('aria-invalid') === 'true';

  it('an empty form flags date, start, end, label and the table row', async () => {
    renderForm();
    await screen.findByRole('heading', { level: 1, name: 'New slot' });
    await submit();
    for (const label of ['Date', 'Start time', 'End time', 'Label', 'Table name', 'Seats']) {
      expect(screen.getByLabelText(label), label).toHaveAttribute('aria-invalid', 'true');
    }
    expect(screen.getByLabelText('Date')).toHaveAccessibleDescription(/Date is required/);
    expect(screen.getByLabelText('Start time')).toHaveAccessibleDescription(/Start time is required/);
    expect(screen.getByLabelText('End time')).toHaveAccessibleDescription(/End time is required/);
    expect(screen.getByLabelText('Table name')).toHaveAccessibleDescription(/Table name is required/);
    expect(slotsApi.createSlot).not.toHaveBeenCalled();
  });

  it('leaving a field that shows an error checks it again (still wrong → still flagged)', async () => {
    renderForm();
    await screen.findByRole('heading', { level: 1, name: 'New slot' });
    await submit();
    for (const label of ['Date', 'Start time', 'End time', 'Label', 'Table name', 'Seats']) {
      const field = screen.getByLabelText(label);
      fireEvent.blur(field);
      await waitFor(() => expect(field, label).toHaveAttribute('aria-invalid', 'true'));
    }
  });

  it('once errors are shown, editing, adding, removing and copying tables updates them', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([
      slot({ id: 7, label: 'Big dinner', tables: [{ id: 1, name: 'A', seats: 8 }] }),
    ]);
    renderForm();
    const copy = await screen.findByLabelText('Copy tables from');
    await waitFor(() => expect(within(copy).getByRole('option', { name: /Big dinner/ })).toBeInTheDocument());
    await submit();
    expect(errorOf(tableNames()[0])).toBe(true);

    await userEvent.type(tableNames()[0], 'T1'); // updateTable
    expect(errorOf(tableNames()[0])).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Add table' })); // the new row is empty
    expect(errorOf(tableNames()[1])).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Remove table 2' }));
    expect(tableNames()).toHaveLength(1);
    expect(errorOf(tableNames()[0])).toBe(false);

    await userEvent.selectOptions(copy, within(copy).getByRole('option', { name: /Big dinner/ }));
    expect(tableNames()[0]).toHaveValue('A');
    expect(errorOf(screen.getByLabelText('Seats'))).toBe(false);
  });

  it('choosing "Choose a slot" again keeps the tables as they are', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([
      slot({ id: 7, label: 'Big dinner', tables: [{ id: 1, name: 'A', seats: 8 }] }),
    ]);
    renderForm();
    const copy = await screen.findByLabelText('Copy tables from');
    await waitFor(() => expect(within(copy).getByRole('option', { name: /Big dinner/ })).toBeInTheDocument());
    await userEvent.selectOptions(copy, within(copy).getByRole('option', { name: /Big dinner/ }));
    await userEvent.selectOptions(copy, within(copy).getByRole('option', { name: 'Choose a slot' }));
    expect(tableNames()[0]).toHaveValue('A');
  });

  it('shows an error when the nearby slots cannot be loaded', async () => {
    vi.mocked(slotsApi.listSlots).mockRejectedValue(new ApiError(500, 'Cannot load the slots.'));
    renderForm();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot load the slots.');
    expect(within(screen.getByLabelText('Copy tables from')).getAllByRole('option')).toHaveLength(1);
  });

  it.each([
    ['an answer', (load) => load.resolve([slot()])],
    ['an error', (load) => load.reject(new ApiError(500, 'Late error.'))],
  ])('ignores %s for the nearby slots that arrives after leaving the page', async (_what, settle) => {
    const load = deferred();
    vi.mocked(slotsApi.listSlots).mockReturnValue(load.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderForm();
    await screen.findByRole('heading', { level: 1, name: 'New slot' });
    unmount();
    settle(load);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('says "1 seat" for a total capacity of one', async () => {
    renderForm();
    await userEvent.type(await screen.findByLabelText('Seats'), '1');
    expect(screen.getByText('Total capacity: 1 seat')).toBeInTheDocument();
  });

  it('Cancel goes back to the week of the date the form was opened for', async () => {
    renderForm('/staff/slots/new?date=2026-11-05');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Landed on /staff/slots?week=2026-11-05')).toBeInTheDocument();
  });
});
