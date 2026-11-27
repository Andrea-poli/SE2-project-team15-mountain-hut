// MH-10 FT1 – PreviousMenus, "Reuse a previous menu" (task MH-10 FE2), from docs/openapi.yaml (GET /api/slots/menus,
// PreviousMenu).
//  The first list is asked at once with '' ("Loading…"); typing asks again only after a 300 ms pause, once, with the
//  last text, trimmed (spaces only = no search); while a new search runs the old list stays, a hidden status says
//  "Searching…" and the empty message is not shown; an answer for a text already changed is ignored.
//  The saved menu of the slot being edited is left out only while it equals the editor text (trimmed).
//  "No menus have been written yet." / "No previous menus contain this text."; an error is shown in an alert;
//  Enter in the search box does not submit the form; "Use this menu" calls onUse(menu, previous), and its accessible name starts with that visible text, then the
//  slot ("Use this menu: Lunch, Tue 3 Nov 12:00"); disabled.
// The timing tests use fake timers and fireEvent (user-event waits on a real timeout, which fake timers never run).
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/client.js';
import * as slotsApi from '../../../src/api/slots.js';
import PreviousMenus from '../../../src/components/PreviousMenus.jsx';

vi.mock('../../../src/api/slots.js', () => ({ listPreviousMenus: vi.fn() }));

const previous = (over = {}) => ({
  menu: '**Polenta** with mushrooms',
  slotId: 7,
  date: '2026-11-05',
  startTime: '19:00',
  label: 'Dinner',
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

/** With fake timers: lets the timers due in `ms` run, then the answers they asked for. */
const wait = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

function renderList({ slotId = 1, editorText = '', disabled = false } = {}) {
  const onUse = vi.fn();
  const onSubmit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <PreviousMenus slotId={slotId} editorText={editorText} onUse={onUse} disabled={disabled} />
    </form>,
  );
  return { onUse, onSubmit };
}
const searchBox = () => screen.getByRole('searchbox', { name: 'Search previous menus' });
const search = (text) => fireEvent.change(searchBox(), { target: { value: text } });
const searchingStatus = () => screen.queryByText('Searching…');

describe('PreviousMenus – timing (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());

  it('asks the first list at once, with no text, and shows "Loading…" until it arrives', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([previous()]);
    renderList();
    expect(screen.getByRole('heading', { name: 'Reuse a previous menu' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    await wait();

    expect(slotsApi.listPreviousMenus).toHaveBeenCalledTimes(1);
    expect(slotsApi.listPreviousMenus).toHaveBeenCalledWith('');
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getByText('Dinner, Thu 5 Nov 19:00')).toBeInTheDocument();
    expect(screen.getByText('Polenta').tagName).toBe('STRONG'); // the menu is shown formatted
  });

  it('typing asks again only after a 300 ms pause, once, with the last text', async () => {
    renderList();
    await wait();

    search('p');
    await wait(200);
    search('po');
    await wait(200);
    search('pol');
    await wait(299);
    expect(slotsApi.listPreviousMenus).toHaveBeenCalledTimes(1);

    await wait(1);
    expect(slotsApi.listPreviousMenus).toHaveBeenCalledTimes(2);
    expect(slotsApi.listPreviousMenus).toHaveBeenLastCalledWith('pol');
  });

  it('the search is trimmed: spaces at the ends do not change it', async () => {
    renderList();
    await wait();

    search('  pol ');
    await wait(300);
    expect(slotsApi.listPreviousMenus).toHaveBeenLastCalledWith('pol');

    search('pol   ');
    await wait(300);
    expect(slotsApi.listPreviousMenus).toHaveBeenCalledTimes(2); // same search: not asked again
  });

  it('spaces only are no search: nothing else is asked, and the list stays', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([previous()]);
    renderList();
    await wait();

    search('   ');
    await wait(300);

    expect(slotsApi.listPreviousMenus.mock.calls).toEqual([['']]);
    expect(searchingStatus()).not.toBeInTheDocument();
    expect(screen.getByText('Dinner, Thu 5 Nov 19:00')).toBeInTheDocument();
  });

  it('while a new search runs, the old list stays and a hidden status says "Searching…"', async () => {
    const searching = deferred();
    vi.mocked(slotsApi.listPreviousMenus)
      .mockResolvedValueOnce([previous()])
      .mockReturnValueOnce(searching.promise);
    renderList();
    await wait();
    expect(searchingStatus()).not.toBeInTheDocument();

    search('caviar');
    expect(searchingStatus()).toHaveAttribute('role', 'status');
    expect(screen.getByText('Dinner, Thu 5 Nov 19:00')).toBeInTheDocument();
    await wait(300); // the request is out, not answered yet
    expect(slotsApi.listPreviousMenus).toHaveBeenLastCalledWith('caviar');
    expect(searchingStatus()).toBeInTheDocument();
    expect(screen.getByText('Dinner, Thu 5 Nov 19:00')).toBeInTheDocument();

    searching.resolve([]);
    await wait();

    expect(searchingStatus()).not.toBeInTheDocument();
    expect(screen.queryByText('Dinner, Thu 5 Nov 19:00')).not.toBeInTheDocument();
    expect(screen.getByText('No previous menus contain this text.')).toBeInTheDocument();
  });

  it('the empty message is not shown while a search runs', async () => {
    const searching = deferred();
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValueOnce([]).mockReturnValueOnce(searching.promise);
    renderList();
    await wait();
    expect(screen.getByText('No menus have been written yet.')).toBeInTheDocument();

    search('polenta');
    await wait(300);

    expect(searchingStatus()).toBeInTheDocument();
    expect(screen.queryByText(/No menus|No previous menus/)).not.toBeInTheDocument();

    searching.resolve([]);
    await wait();
    expect(screen.getByText('No previous menus contain this text.')).toBeInTheDocument();
  });

  it.each([
    ['an answer', (first) => first.resolve([previous({ label: 'Old answer' })])],
    ['an error', (first) => first.reject(new ApiError(500, 'Old error'))],
  ])('ignores %s for a text already changed', async (_what, settle) => {
    const first = deferred();
    vi.mocked(slotsApi.listPreviousMenus)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue([previous({ label: 'Lunch' })]);
    renderList();
    await wait(); // the first request is out, still unanswered

    search('l');
    settle(first);
    await wait(300);

    expect(screen.getByText('Lunch, Thu 5 Nov 19:00')).toBeInTheDocument();
    expect(screen.queryByText(/Old answer/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PreviousMenus', () => {
  const thisSlotMenu = previous({ slotId: 1, label: 'This slot', menu: 'Venison stew' });
  const otherMenu = previous({ slotId: 2, label: 'Lunch', menu: 'Barley soup' });

  it('leaves out the saved menu of the slot being edited while the editor holds the same text (trimmed)', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([thisSlotMenu, otherMenu]);
    renderList({ slotId: 1, editorText: '  Venison stew\n' });

    expect(await screen.findByText('Barley soup')).toBeInTheDocument();
    expect(screen.queryByText(/This slot/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Use this menu: / })).toHaveLength(1);
  });

  it('shows the saved menu of the slot being edited once the editor text is different', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([thisSlotMenu, otherMenu]);
    renderList({ slotId: 1, editorText: 'Venison stew with polenta' });

    expect(await screen.findByText('Venison stew')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this menu: This slot, Thu 5 Nov 19:00' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Use this menu: / })).toHaveLength(2);
  });

  it('the same text on another slot is not left out', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([previous({ slotId: 2, label: 'Lunch', menu: 'Venison stew' })]);
    renderList({ slotId: 1, editorText: 'Venison stew' });

    expect(await screen.findByRole('button', { name: 'Use this menu: Lunch, Thu 5 Nov 19:00' })).toBeInTheDocument();
  });

  it('"No menus have been written yet." without a search, also when the only menu is the one in the editor', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([thisSlotMenu]);
    renderList({ slotId: 1, editorText: 'Venison stew' });

    expect(await screen.findByText('No menus have been written yet.')).toHaveAttribute('role', 'status');
  });

  it('"No previous menus contain this text." after a search without results', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('No menus have been written yet.');

    await user.type(searchBox(), 'caviar');

    expect(await screen.findByText('No previous menus contain this text.')).toHaveAttribute('role', 'status');
    expect(slotsApi.listPreviousMenus).toHaveBeenLastCalledWith('caviar');
  });

  it('an error is shown in an alert, without the "no menus" message', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockRejectedValue(new ApiError(500, 'Something went wrong, please try again'));
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong, please try again');
    expect(screen.queryByText(/No menus|No previous menus/)).not.toBeInTheDocument();
  });

  it('Enter in the search box does not submit the form', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderList();
    await screen.findByText('No menus have been written yet.');

    await user.type(searchBox(), 'pol{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(searchBox()).toHaveValue('pol');
  });

  it('the name of each "Use this menu" button starts with its visible text and says which slot it is', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([
      previous(),
      previous({ slotId: 2, label: 'Lunch', date: '2026-11-03', startTime: '12:00', menu: 'Barley soup' }),
    ]);
    renderList();

    const buttons = await screen.findAllByRole('button', { name: /Use this menu/ });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveTextContent('Use this menu');
      expect(button).toHaveAccessibleName(expect.stringMatching(/^Use this menu/));
    }
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Use this menu: Dinner, Thu 5 Nov 19:00',
      'Use this menu: Lunch, Tue 3 Nov 12:00',
    ]);
  });

  it('"Use this menu" calls onUse with the text and the previous menu', async () => {
    const user = userEvent.setup();
    const lunch = previous({ slotId: 2, label: 'Lunch', date: '2026-11-03', startTime: '12:00', menu: 'Barley soup' });
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([previous(), lunch]);
    const { onUse } = renderList();

    const button = await screen.findByRole('button', { name: 'Use this menu: Lunch, Tue 3 Nov 12:00' });
    expect(button).toHaveTextContent('Use this menu');
    await user.click(button);

    expect(onUse).toHaveBeenCalledWith('Barley soup', lunch);
  });

  it('disabled: the "Use this menu" buttons are disabled', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([previous()]);
    renderList({ disabled: true });

    expect(await screen.findByRole('button', { name: 'Use this menu: Dinner, Thu 5 Nov 19:00' })).toBeDisabled();
  });
});
