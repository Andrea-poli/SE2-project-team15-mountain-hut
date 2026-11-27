// MH-10 FT1 – menus in the staff week view (SlotsWeekPage, task MH-10 FE1), from the story and docs/openapi.yaml
// (PUT /api/slots/{id}/menu answers the whole Slot). Only today's and future slots: whether "Add menu" stays on
// past days is still open (PO issue #59).
//  "View menu" on the open card → the menu in a dialog; Close closes it; "Edit menu" → the editor.
//  "Add menu" → the editor; Cancel closes it without saving.
//  After saving, the saved slot replaces the old one in the week (no reload, the card stays open) and
//  "Menu saved: …" / "Menu removed: …" is shown; it can be closed, and moving to another week removes it.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import * as slotsApi from '../../../src/api/slots.js';
import SlotsWeekPage from '../../../src/pages/staff/SlotsWeekPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/slots.js', () => ({
  listSlots: vi.fn(),
  createSlot: vi.fn(),
  copyWeek: vi.fn(),
  setSlotMenu: vi.fn(),
  listPreviousMenus: vi.fn(),
}));

// "Now": Wednesday 4 November 2026, 10:00 in the hut → the current week is Mon 2 – Sun 8 Nov.
const NOW = new Date(2026, 10, 4, 10, 0);

const slot = (over = {}) => ({
  id: 5,
  date: '2026-11-05',
  startTime: '19:00',
  endTime: '20:30',
  label: 'Dinner',
  status: 'open',
  past: false,
  menu: null,
  tables: [{ id: 11, name: 'T1', seats: 4 }],
  ...over,
});
const SLOT_NAME = 'Dinner, Thu 5 Nov, 19:00 – 20:30';

let user;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true, toFake: ['Date'] });
  user = userEvent.setup({ delay: null });
  vi.mocked(authApi.me).mockResolvedValue(employee);
  vi.mocked(slotsApi.listSlots).mockResolvedValue([]);
  vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

/** Shows the current week with `shown` in it and opens its card. */
async function openCard(shown) {
  vi.mocked(slotsApi.listSlots).mockResolvedValue([shown]);
  renderPage(<SlotsWeekPage />, { path: '/staff/slots' });
  await user.click(await screen.findByRole('button', { name: /Dinner/ }));
}
const card = () => screen.getByRole('button', { name: /Dinner/ });
const dialog = () => screen.getByRole('dialog');
const noDialog = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
const menuMessage = () => screen.queryByText(/^Menu (saved|removed):/);

describe('SlotsWeekPage – menus (MH-10)', () => {
  it('"View menu" shows the menu of the slot in a dialog; Close closes it', async () => {
    await openCard(slot({ menu: '**Venison stew**' }));

    await user.click(screen.getByRole('button', { name: 'View menu' }));

    expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent(`Menu${SLOT_NAME}`);
    expect(within(dialog()).getByText('Venison stew')).toBeInTheDocument();
    await user.click(within(dialog()).getAllByRole('button', { name: 'Close' })[0]);
    await noDialog();
  });

  it('"Edit menu" in the dialog opens the editor on the saved menu, in place of the dialog', async () => {
    await openCard(slot({ menu: 'Soup' }));
    await user.click(screen.getByRole('button', { name: 'View menu' }));

    await user.click(within(dialog()).getByRole('button', { name: 'Edit menu' }));

    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent(`Edit menu${SLOT_NAME}`);
    expect(within(dialog()).getByRole('textbox', { name: 'Menu' })).toHaveValue('Soup');
  });

  it('"Add menu" opens the editor; Cancel closes it without saving', async () => {
    await openCard(slot());

    await user.click(screen.getByRole('button', { name: 'Add menu' }));
    expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent(`Add menu${SLOT_NAME}`);
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    await noDialog();
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
    expect(card()).toHaveTextContent('No menu');
  });

  it('after saving, the slot is replaced in the week, its card stays open, and "Menu saved: …" is shown', async () => {
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue(slot({ menu: 'Polenta' }));
    await openCard(slot());
    await user.click(screen.getByRole('button', { name: 'Add menu' }));

    await user.type(within(dialog()).getByRole('textbox', { name: 'Menu' }), 'Polenta');
    await user.click(within(dialog()).getByRole('button', { name: 'Save menu' }));

    expect(slotsApi.setSlotMenu).toHaveBeenCalledWith(5, 'Polenta');
    await noDialog();
    expect(await screen.findByText(`Menu saved: ${SLOT_NAME}`)).toHaveAttribute('role', 'status');
    expect(card()).toHaveTextContent('Menu set');
    expect(card()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'View menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add menu' })).not.toBeInTheDocument();
    expect(slotsApi.listSlots).toHaveBeenCalledTimes(1); // no reload: the answer is the slot

    await user.click(screen.getByRole('button', { name: 'View menu' })); // the new menu is the one shown
    expect(within(dialog()).getByText('Polenta')).toBeInTheDocument();
  });

  it('after removing, the card says "No menu" and "Menu removed: …" is shown', async () => {
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue(slot({ menu: null }));
    await openCard(slot({ menu: 'Soup' }));
    await user.click(screen.getByRole('button', { name: 'View menu' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Edit menu' }));

    await user.click(within(dialog()).getByRole('button', { name: 'Remove menu' }));

    expect(slotsApi.setSlotMenu).toHaveBeenCalledWith(5, null);
    await noDialog();
    expect(await screen.findByText(`Menu removed: ${SLOT_NAME}`)).toHaveAttribute('role', 'status');
    expect(card()).toHaveTextContent('No menu');
    expect(screen.getByRole('button', { name: 'Add menu' })).toBeInTheDocument();
  });

  it('only the saved slot changes, the others stay as they were', async () => {
    const lunch = slot({ id: 6, date: '2026-11-06', startTime: '12:00', endTime: '14:00', label: 'Lunch', menu: 'Old soup' });
    vi.mocked(slotsApi.listSlots).mockResolvedValue([slot(), lunch]);
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue(slot({ menu: 'Polenta' }));
    renderPage(<SlotsWeekPage />, { path: '/staff/slots' });
    await user.click(await screen.findByRole('button', { name: /Dinner/ }));
    await user.click(screen.getByRole('button', { name: 'Add menu' }));
    await user.type(within(dialog()).getByRole('textbox', { name: 'Menu' }), 'Polenta');
    await user.click(within(dialog()).getByRole('button', { name: 'Save menu' }));
    await screen.findByText(`Menu saved: ${SLOT_NAME}`);

    expect(card()).toHaveTextContent('Menu set');
    expect(screen.getByRole('button', { name: /Lunch/ })).toHaveTextContent('Menu set');
    await user.click(screen.getByRole('button', { name: /Lunch/ }));
    await user.click(screen.getByRole('button', { name: 'View menu' }));
    expect(within(dialog()).getByText('Old soup')).toBeInTheDocument();
  });

  async function saveMenu() {
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue(slot({ menu: 'Polenta' }));
    await openCard(slot());
    await user.click(screen.getByRole('button', { name: 'Add menu' }));
    await user.type(within(dialog()).getByRole('textbox', { name: 'Menu' }), 'Polenta');
    await user.click(within(dialog()).getByRole('button', { name: 'Save menu' }));
    await noDialog();
    await screen.findByText(`Menu saved: ${SLOT_NAME}`);
  }

  it('the message can be closed', async () => {
    await saveMenu();
    await user.click(within(menuMessage()).getByRole('button', { name: /close/i }));
    expect(menuMessage()).not.toBeInTheDocument();
  });

  it.each(['Previous week', 'Next week'])('"%s" removes the message', async (name) => {
    await saveMenu();
    await user.click(screen.getByRole('button', { name }));
    expect(menuMessage()).not.toBeInTheDocument();
  });

  it('"Today" removes the message (saved on a slot of next week)', async () => {
    const nextWeek = slot({ date: '2026-11-10' });
    vi.mocked(slotsApi.listSlots).mockResolvedValue([nextWeek]);
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue({ ...nextWeek, menu: 'Polenta' });
    renderPage(<SlotsWeekPage />, { path: '/staff/slots', url: '/staff/slots?week=2026-11-09' });
    await user.click(await screen.findByRole('button', { name: /Dinner/ }));
    await user.click(screen.getByRole('button', { name: 'Add menu' }));
    await user.type(within(dialog()).getByRole('textbox', { name: 'Menu' }), 'Polenta');
    await user.click(within(dialog()).getByRole('button', { name: 'Save menu' }));
    await screen.findByText('Menu saved: Dinner, Tue 10 Nov, 19:00 – 20:30');

    await user.click(screen.getByRole('button', { name: 'Today' }));

    expect(menuMessage()).not.toBeInTheDocument();
  });

  it('opening the editor again removes the message of the last save', async () => {
    await saveMenu();
    await user.click(screen.getByRole('button', { name: 'View menu' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Edit menu' }));
    expect(menuMessage()).not.toBeInTheDocument();
  });
});
