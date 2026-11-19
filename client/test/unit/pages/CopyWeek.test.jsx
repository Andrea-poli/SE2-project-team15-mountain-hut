// MH-09 FT1 – unit tests of "Copy week" (CopyWeekDialog + its use in SlotsWeekPage, task MH-09 FE1), written from
// the story, the PO answer #45 and docs/openapi.yaml (copyWeek, CopyWeekResult): behaviour only – roles, labels,
// visible text – never markup or classes.
//  Dialog: the target week is chosen with ‹ / › (the next week first; never a past week; the shown week is skipped);
//  a warning says how many slots of the target week will be replaced (only those not started, PO #45); a 409 (the
//  target week has bookings) is shown under the picker and blocks that week; other errors in an alert; while
//  copying the dialog cannot be closed.
//  Page: "Copy week" (disabled for a week without slots) opens the dialog; after a copy the target week is shown
//  with a summary of the slots copied, replaced and skipped, and the skipped ones can be listed with the reason.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import * as slotsApi from '../../../src/api/slots.js';
import CopyWeekDialog from '../../../src/components/CopyWeekDialog.jsx';
import SlotsWeekPage from '../../../src/pages/staff/SlotsWeekPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/api/slots.js', () => ({ listSlots: vi.fn(), createSlot: vi.fn(), copyWeek: vi.fn() }));

// "Now": Wednesday 4 November 2026, 10:00 in the hut → the current week is Mon 2 – Sun 8 Nov.
const NOW = new Date(2026, 10, 4, 10, 0);
const monday = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const slot = (over = {}) => ({
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
const result = (over = {}) => ({ created: [], replaced: [], skipped: [], ...over });
const skippedSlot = (reason, over = {}) => ({ date: '2026-11-10', startTime: '12:00', endTime: '14:00', label: 'Lunch', reason, ...over });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let user;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true, toFake: ['Date'] });
  user = userEvent.setup({ delay: null });
  vi.mocked(authApi.me).mockResolvedValue(employee);
  vi.mocked(slotsApi.listSlots).mockResolvedValue([]);
  vi.mocked(slotsApi.copyWeek).mockResolvedValue(result());
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------- the dialog

describe('CopyWeekDialog', () => {
  function renderDialog(weekIso = '2026-11-02') {
    const onHide = vi.fn();
    const onCopied = vi.fn();
    renderPage(<CopyWeekDialog weekStart={monday(weekIso)} onHide={onHide} onCopied={onCopied} />, { path: '/' });
    return { onHide, onCopied };
  }
  const dialog = () => screen.getByRole('dialog', { name: 'Copy week' });
  const picker = () => within(dialog()).getByRole('group');
  const targetShown = (text) => expect(within(picker()).getByText(text)).toBeInTheDocument();
  const button = (name) => within(dialog()).getByRole('button', { name });

  it('says which week is copied, with its tables, and that bookings are not copied', () => {
    renderDialog();
    expect(dialog()).toHaveTextContent('Copy the slots of 2 – 8 Nov 2026, with their tables, into:');
    expect(dialog()).toHaveTextContent(/Bookings are not copied/);
  });

  it('proposes the next week and copies the shown week into it', async () => {
    const { onCopied } = renderDialog();
    targetShown('9 – 15 Nov 2026');
    const answer = result({ created: [slot()] });
    vi.mocked(slotsApi.copyWeek).mockResolvedValue(answer);

    await user.click(button('Copy slots'));

    expect(slotsApi.copyWeek).toHaveBeenCalledWith('2026-11-02', '2026-11-09');
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith(answer, '2026-11-09'));
  });

  it('from a week in the past, it proposes the week after the current one', () => {
    renderDialog('2026-10-19');
    targetShown('9 – 15 Nov 2026');
  });

  it('never offers a past week: from the current week, ‹ is disabled at once', () => {
    renderDialog('2026-11-02'); // the only earlier choice would be 26 Oct, already past
    expect(button('Previous week')).toBeDisabled();
  });

  it('skips the shown week in both directions, and stops at the current week', async () => {
    renderDialog('2026-11-09'); // shown: next week → proposed: 16 Nov
    targetShown('16 – 22 Nov 2026');

    await user.click(button('Previous week')); // skips 9 Nov, the shown week
    targetShown('2 – 8 Nov 2026');
    expect(button('Previous week')).toBeDisabled(); // the current week is the earliest

    await user.click(button('Next week')); // skips 9 Nov again
    targetShown('16 – 22 Nov 2026');
  });

  it('warns how many slots of the target week will be replaced, counting only those not started', async () => {
    vi.mocked(slotsApi.listSlots).mockImplementation(async (from) => {
      if (from === '2026-11-09') return [slot({ id: 1 }), slot({ id: 2 }), slot({ id: 3, past: true })];
      if (from === '2026-11-16') return [slot({ id: 4 })];
      return [];
    });
    renderDialog();

    expect(await within(dialog()).findByText('This week has 2 slots: they will be replaced.')).toBeInTheDocument();
    expect(slotsApi.listSlots).toHaveBeenCalledWith('2026-11-09', '2026-11-15');

    await user.click(button('Next week'));
    expect(await within(dialog()).findByText('This week has 1 slot: it will be replaced.')).toBeInTheDocument();

    await user.click(button('Next week')); // 23 Nov: empty
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-23', '2026-11-29'));
    expect(within(dialog()).queryByText(/will be replaced/)).not.toBeInTheDocument();
  });

  it('ignores the answer for a week already left', async () => {
    const slow = deferred();
    vi.mocked(slotsApi.listSlots).mockImplementation((from) => (from === '2026-11-09' ? slow.promise : Promise.resolve([slot()])));
    renderDialog();

    await user.click(button('Next week')); // 16 Nov answers at once: 1 slot
    expect(await within(dialog()).findByText('This week has 1 slot: it will be replaced.')).toBeInTheDocument();
    slow.resolve([slot({ id: 1 }), slot({ id: 2 }), slot({ id: 3 })]); // late answer for 9 Nov
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(within(dialog()).getByText('This week has 1 slot: it will be replaced.')).toBeInTheDocument();
  });

  it('shows no warning when the target week cannot be read, and still copies', async () => {
    vi.mocked(slotsApi.listSlots).mockRejectedValue(new ApiError(500, 'Cannot load the slots.'));
    const { onCopied } = renderDialog();
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenCalled());

    expect(within(dialog()).queryByText(/will be replaced/)).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
    await user.click(button('Copy slots'));
    await waitFor(() => expect(onCopied).toHaveBeenCalled());
  });

  it('a 409 (the target week has bookings) is shown under the picker, with the focus, and blocks that week', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([slot()]);
    vi.mocked(slotsApi.copyWeek).mockRejectedValue(new ApiError(409, 'The target week has bookings: its schedule cannot be replaced'));
    const { onCopied } = renderDialog();

    await user.click(button('Copy slots'));

    const message = await within(dialog()).findByText('This week has bookings: choose another week.');
    await waitFor(() => expect(message).toHaveFocus());
    expect(within(dialog()).queryByText(/will be replaced/)).not.toBeInTheDocument(); // one message at a time
    expect(button('Copy slots')).toBeDisabled();
    expect(onCopied).not.toHaveBeenCalled();

    await user.click(button('Next week')); // another week: copy allowed again
    expect(within(dialog()).queryByText(/has bookings/)).not.toBeInTheDocument();
    expect(button('Copy slots')).toBeEnabled();

    await user.click(button('Previous week')); // back: the message again, without asking the server
    expect(within(dialog()).getByText('This week has bookings: choose another week.')).toBeInTheDocument();
    expect(button('Copy slots')).toBeDisabled();
    expect(slotsApi.copyWeek).toHaveBeenCalledTimes(1);
  });

  it('other errors are shown in an alert with the focus; changing week removes them', async () => {
    vi.mocked(slotsApi.copyWeek).mockRejectedValue(new ApiError(500, 'Something went wrong, please try again'));
    renderDialog();

    await user.click(button('Copy slots'));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong, please try again');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(button('Copy slots')).toBeEnabled(); // it can be tried again

    await user.click(button('Next week'));
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('while copying: "Copying…", every control disabled, and Escape does not close it', async () => {
    const copying = deferred();
    vi.mocked(slotsApi.copyWeek).mockReturnValue(copying.promise);
    const { onHide, onCopied } = renderDialog();

    await user.click(button('Copy slots'));

    expect(button('Copying…')).toBeDisabled();
    expect(button('Cancel')).toBeDisabled();
    expect(button('Previous week')).toBeDisabled();
    expect(button('Next week')).toBeDisabled();
    expect(within(dialog()).queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onHide).not.toHaveBeenCalled();

    await user.click(button('Copying…')); // a second click is ignored (disabled button)…
    fireEvent.submit(button('Copying…').closest('form')); // …and so is a second submit of the form
    copying.resolve(result());
    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    expect(slotsApi.copyWeek).toHaveBeenCalledTimes(1);
  });

  it('Cancel and Escape close it without copying', async () => {
    const { onHide } = renderDialog();

    await user.click(button('Cancel'));
    await user.keyboard('{Escape}');

    expect(onHide).toHaveBeenCalledTimes(2);
    expect(slotsApi.copyWeek).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- in the week view

describe('SlotsWeekPage – Copy week', () => {
  const renderWeek = () => renderPage(<SlotsWeekPage />, { path: '/staff/slots' });
  const copyButton = () => screen.getByRole('button', { name: 'Copy week' });
  const summary = () => screen.getAllByRole('status').find((el) => /cop(ied|y)/i.test(el.textContent));

  /** Opens the dialog on the current week and copies into the next week; the copy answers `answer`. */
  async function copyNow(answer) {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([slot()]);
    vi.mocked(slotsApi.copyWeek).mockResolvedValue(answer);
    renderWeek();
    await waitFor(() => expect(copyButton()).toBeEnabled());
    await user.click(copyButton());
    await user.click(within(screen.getByRole('dialog', { name: 'Copy week' })).getByRole('button', { name: 'Copy slots' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(summary()).toBeTruthy()); // the summary of the target week is on screen
  }

  it('"Copy week" is disabled for a week without slots, and opens the dialog otherwise', async () => {
    renderWeek();
    await screen.findAllByText('No slots');
    expect(copyButton()).toBeDisabled();
  });

  it('after a copy the dialog closes and the target week is shown, with the summary', async () => {
    await copyNow(result({ created: [slot({ id: 7 }), slot({ id: 8 })], replaced: [slot({ id: 3 })] }));

    expect(slotsApi.copyWeek).toHaveBeenCalledWith('2026-11-02', '2026-11-09');
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-09', '2026-11-15'));
    expect(summary()).toHaveTextContent('2 slots copied, 1 replaced.');
  });

  it.each([
    ['one slot copied', result({ created: [slot()] }), '1 slot copied.'],
    ['some skipped, with the reasons', result({ created: [slot()], skipped: [skippedSlot('overlap'), skippedSlot('past')] }),
      '1 slot copied, 2 not copied (1 overlap, 1 already past).'],
    ['only past ones skipped', result({ created: [slot(), slot({ id: 2 }), slot({ id: 3 })], skipped: [skippedSlot('past')] }),
      '3 slots copied, 1 not copied (1 already past).'],
    ['none copied, all past, some replaced', result({ replaced: [slot(), slot({ id: 2 })], skipped: [skippedSlot('past'), skippedSlot('past')] }),
      'No slots copied, 2 replaced: 2 slots are already past.'],
    ['none copied, one overlapping', result({ skipped: [skippedSlot('overlap')] }),
      'No slots copied: 1 slot is at the same time as a slot that has already started.'],
    ['none copied, both reasons', result({ skipped: [skippedSlot('overlap'), skippedSlot('overlap'), skippedSlot('past')] }),
      'No slots copied: 2 slots are at the same time as slots that have already started, 1 slot is already past.'],
    ['nothing at all', result(), 'No slots copied.'],
  ])('summary: %s', async (_case, answer, text) => {
    await copyNow(answer);
    await waitFor(() => expect(summary()).toHaveTextContent(text));
  });

  it('"Show details" lists the skipped slots with the reason; "Hide details" closes the list', async () => {
    await copyNow(result({
      created: [slot()],
      skipped: [skippedSlot('past'), skippedSlot('overlap', { date: '2026-11-11', startTime: '19:00', endTime: '20:30', label: 'Dinner' })],
    }));
    const show = within(summary()).getByRole('button', { name: 'Show details' });
    expect(show).toHaveAttribute('aria-expanded', 'false');

    await user.click(show);

    const hide = within(summary()).getByRole('button', { name: 'Hide details' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    const items = within(summary()).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Tue 10 Nov, 12:00 – 14:00 Lunch – already past',
      'Wed 11 Nov, 19:00 – 20:30 Dinner – a slot has already started at that time',
    ]);

    await user.click(hide);
    expect(within(summary()).getByRole('button', { name: 'Show details' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a summary without skipped slots has no details', async () => {
    await copyNow(result({ created: [slot()] }));
    expect(within(summary()).queryByRole('button', { name: /details/ })).not.toBeInTheDocument();
  });

  it('the summary can be closed', async () => {
    await copyNow(result({ created: [slot()] }));
    await user.click(within(summary()).getByRole('button', { name: /close/i }));
    expect(screen.queryByText('1 slot copied.')).not.toBeInTheDocument();
  });

  it.each(['Previous week', 'Next week', 'Today'])('"%s" leaves the target week and removes the summary', async (name) => {
    await copyNow(result({ created: [slot()] }));
    await waitFor(() => expect(slotsApi.listSlots).toHaveBeenLastCalledWith('2026-11-09', '2026-11-15'));

    await user.click(screen.getByRole('button', { name }));

    expect(screen.queryByText('1 slot copied.')).not.toBeInTheDocument();
  });

  it('closing the dialog without copying leaves the week as it was', async () => {
    vi.mocked(slotsApi.listSlots).mockResolvedValue([slot()]);
    renderWeek();
    await waitFor(() => expect(copyButton()).toBeEnabled());
    await user.click(copyButton());

    await user.click(within(screen.getByRole('dialog', { name: 'Copy week' })).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(slotsApi.copyWeek).not.toHaveBeenCalled();
    expect(screen.getByText('2 – 8 Nov 2026')).toBeInTheDocument(); // still the current week
    expect(screen.queryAllByRole('status').some((el) => /copied/.test(el.textContent))).toBe(false);
  });
});
