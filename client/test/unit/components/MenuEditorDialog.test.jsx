// MH-10 FT1 – MenuEditorDialog, the menu editor of a slot (tasks MH-10 FE1 and FE2), from the story and
// docs/openapi.yaml (info "Menus", PUT /api/slots/{id}/menu, GET /api/slots/menus).
//  Title "Add menu" without a menu, "Edit menu" with one, with the slot (label, date, time).
//  Checks before saving: empty menu → "Enter the menu." (or the "Remove menu" hint when the slot had a menu); more
//  than 2000 characters → the length error; the server is not called. An error goes away on blur once corrected.
//  Toolbar: Bold, Italic, List item, Sub-item change the text of the selection, and the preview follows; pressed
//  again they give back the text; with no selection the caret stays where typing goes on.
//  "Save menu" → setSlotMenu(id, trimmed text), onSaved(slot, false). "Remove menu" (only when the slot had a menu)
//  asks first ("Remove the menu of this slot?", focus on "Keep it"); "Yes, remove" → setSlotMenu(id, null),
//  "Removing…", onSaved(slot, true). Server error: shown, fields enabled again. While saving: every control
//  disabled, "Saving…", the dialog cannot be closed, a second submit is ignored.
//  Cancel and Escape call onHide. "Reuse a previous menu" opens the list; "Use this menu" copies the text into the
//  editor with a "copied" message, which the next change clears.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/client.js';
import * as slotsApi from '../../../src/api/slots.js';
import MenuEditorDialog from '../../../src/components/MenuEditorDialog.jsx';

vi.mock('../../../src/api/slots.js', () => ({ setSlotMenu: vi.fn(), listPreviousMenus: vi.fn() }));

const slot = (over = {}) => ({
  id: 3,
  date: '2026-11-05',
  startTime: '19:00',
  endTime: '20:30',
  label: 'Dinner',
  status: 'open',
  past: false,
  menu: null,
  tables: [{ id: 1, name: 'T1', seats: 4 }],
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

let user;
beforeEach(() => {
  vi.resetAllMocks();
  user = userEvent.setup();
  vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([]);
});

function renderEditor(over = {}) {
  const onHide = vi.fn();
  const onSaved = vi.fn();
  const edited = slot(over);
  render(<MenuEditorDialog slot={edited} onHide={onHide} onSaved={onSaved} />);
  return { onHide, onSaved, edited };
}
const dialog = () => screen.getByRole('dialog');
const button = (name) => within(dialog()).getByRole('button', { name });
const menuField = () => within(dialog()).getByRole('textbox', { name: 'Menu' });
const preview = () => within(dialog()).getByRole('region', { name: 'Preview' });

describe('MenuEditorDialog – title and fields', () => {
  it('"Add menu" for a slot without a menu, with the slot; empty field, placeholder preview, no "Remove menu"', () => {
    renderEditor();
    expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent('Add menuDinner, Thu 5 Nov, 19:00 – 20:30');
    expect(menuField()).toHaveValue('');
    expect(preview()).toHaveTextContent('The menu appears here as hikers will see it.');
    expect(within(dialog()).queryByRole('button', { name: 'Remove menu' })).not.toBeInTheDocument();
  });

  it('"Edit menu" for a slot with a menu, which is in the field and in the preview', () => {
    renderEditor({ menu: '**Polenta**\n- Soup' });
    expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent('Edit menuDinner, Thu 5 Nov, 19:00 – 20:30');
    expect(menuField()).toHaveValue('**Polenta**\n- Soup');
    expect(within(preview()).getByText('Polenta').tagName).toBe('STRONG');
    expect(within(preview()).getByRole('listitem')).toHaveTextContent('Soup');
    expect(button('Remove menu')).toBeEnabled();
  });

  it('the preview follows what is typed', async () => {
    renderEditor();
    await user.type(menuField(), '*Apple strudel*');
    expect(within(preview()).getByText('Apple strudel').tagName).toBe('EM');
  });
});

describe('MenuEditorDialog – checks before saving', () => {
  it.each(['', '   \n  '])('an empty menu (%j): "Enter the menu.", on the field with the focus, no request', async (text) => {
    renderEditor();
    if (text) fireEvent.change(menuField(), { target: { value: text } });

    await user.click(button('Save menu'));

    expect(menuField()).toHaveAttribute('aria-invalid', 'true');
    expect(menuField()).toHaveAccessibleDescription(/^Enter the menu\./);
    await waitFor(() => expect(menuField()).toHaveFocus());
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
  });

  it('a slot that had a menu, emptied: the error points to "Remove menu"', async () => {
    renderEditor({ menu: 'Soup' });
    await user.clear(menuField());

    await user.click(button('Save menu'));

    expect(menuField()).toHaveAccessibleDescription(/^Enter the menu, or press "Remove menu"\./);
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
  });

  it('more than 2000 characters: the length error, no request', async () => {
    renderEditor();
    fireEvent.change(menuField(), { target: { value: 'a'.repeat(2001) } });

    await user.click(button('Save menu'));

    expect(menuField()).toHaveAccessibleDescription(/^The menu must be 2000 characters or fewer\./);
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
  });

  it('2000 characters plus spaces at the ends are accepted, and sent without the spaces', async () => {
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue(slot({ menu: 'a'.repeat(2000) }));
    renderEditor();
    fireEvent.change(menuField(), { target: { value: `  ${'a'.repeat(2000)}\n ` } });

    await user.click(button('Save menu'));

    expect(slotsApi.setSlotMenu).toHaveBeenCalledWith(3, 'a'.repeat(2000));
  });

  it('a corrected error goes away when leaving the field', async () => {
    renderEditor();
    await user.click(button('Save menu'));
    expect(menuField()).toHaveAttribute('aria-invalid', 'true');

    await user.type(menuField(), 'Soup');
    await user.tab();

    expect(menuField()).not.toHaveAttribute('aria-invalid');
    expect(within(dialog()).queryByText('Enter the menu.')).not.toBeInTheDocument();
  });
});

describe('MenuEditorDialog – toolbar', () => {
  it('has the four buttons in a "Menu formatting" toolbar', () => {
    renderEditor();
    const toolbar = within(dialog()).getByRole('toolbar', { name: 'Menu formatting' });
    for (const name of ['Bold', 'Italic', 'List item', 'Sub-item']) {
      expect(within(toolbar).getByRole('button', { name })).toBeEnabled();
    }
  });

  it.each([
    ['Bold', 'Polenta', [0, 7], '**Polenta**', () => expect(within(preview()).getByText('Polenta').tagName).toBe('STRONG')],
    ['Italic', 'Polenta', [0, 7], '*Polenta*', () => expect(within(preview()).getByText('Polenta').tagName).toBe('EM')],
    ['List item', 'Soup\nTart', [0, 9], '- Soup\n- Tart',
      () => expect(within(preview()).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Soup', 'Tart'])],
    ['Sub-item', '- Soup\nvegan', [9, 9], '- Soup\n  - vegan',
      () => {
        const [soup] = within(preview()).getAllByRole('listitem');
        expect(within(soup).getByRole('list')).toHaveTextContent('vegan');
      }],
  ])('%s changes the text, the field keeps the focus and the preview follows; pressed again it gives back the text', async (name, text, [start, end], expected, checkPreview) => {
    renderEditor();
    fireEvent.change(menuField(), { target: { value: text } });
    menuField().setSelectionRange(start, end);

    await user.click(button(name));

    expect(menuField()).toHaveValue(expected);
    expect(menuField()).toHaveFocus();
    checkPreview();

    await user.click(button(name)); // on the selection or caret the first press left
    expect(menuField()).toHaveValue(text);
  });

  it('Sub-item with no selection keeps the caret on the same character, so typing goes on there', async () => {
    renderEditor();
    fireEvent.change(menuField(), { target: { value: '- Soup\nvean' } });
    menuField().setSelectionRange(9, 9); // between "ve" and "an"

    await user.click(button('Sub-item'));
    await user.keyboard('g');

    expect(menuField()).toHaveValue('- Soup\n  - vegan');
  });

  it('after Bold on a selection, the selection includes the marks', async () => {
    renderEditor();
    fireEvent.change(menuField(), { target: { value: 'Polenta' } });
    menuField().setSelectionRange(0, 7);

    await user.click(button('Bold'));
    expect(menuField().value.slice(menuField().selectionStart, menuField().selectionEnd)).toBe('**Polenta**');
  });

  /** Puts `text` in the field and selects from `start` to `end` (the whole text when not given). */
  function select(text, start = 0, end = text.length) {
    fireEvent.change(menuField(), { target: { value: text } });
    menuField().setSelectionRange(start, end);
  }
  const listItems = () => within(preview()).getAllByRole('listitem');

  it('List item on several lines makes a list of them in the preview', async () => {
    renderEditor();
    select('Soup\nStew\nStrudel');

    await user.click(button('List item'));

    expect(within(preview()).getAllByRole('list')).toHaveLength(1);
    expect(listItems().map((li) => li.textContent)).toEqual(['Soup', 'Stew', 'Strudel']);
  });

  it('Sub-item on one line inside a list shows it under the item above', async () => {
    renderEditor();
    select('- Soup\nVegetarian on request\n- Strudel', 7, 7);

    await user.click(button('Sub-item'));

    const [soup] = listItems();
    expect(within(soup).getByRole('list')).toHaveTextContent('Vegetarian on request');
    expect(within(preview()).getByText('Strudel')).toBeInTheDocument();
  });

  it('Sub-item on lines with no item above: the first is shown as an item, the others as its sub-items', async () => {
    renderEditor();
    select('Soup\nVegetarian\nVegan');

    await user.click(button('Sub-item'));

    const [outer] = within(preview()).getAllByRole('list');
    const items = within(outer).getAllByRole('listitem');
    const inner = within(items[0]).getByRole('list');
    expect(items.filter((li) => !inner.contains(li)).map((li) => li.firstChild.textContent)).toEqual(['Soup']);
    expect(within(inner).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Vegetarian', 'Vegan']);
  });

  it('Bold on the text of an item shows a bold item', async () => {
    renderEditor();
    select('- Polenta with mushrooms', 2, 9);

    await user.click(button('Bold'));

    expect(listItems()).toHaveLength(1);
    expect(within(listItems()[0]).getByText('Polenta').tagName).toBe('STRONG');
    expect(preview()).not.toHaveTextContent('*');
  });

  it('Bold on two selected items shows a list of two bold items', async () => {
    renderEditor();
    select('- Soup\n- Stew');

    await user.click(button('Bold'));

    expect(listItems().map((li) => li.textContent)).toEqual(['Soup', 'Stew']);
    expect(within(preview()).getByText('Soup').tagName).toBe('STRONG');
    expect(within(preview()).getByText('Stew').tagName).toBe('STRONG');
    expect(preview()).not.toHaveTextContent('*');
  });

  it('List item pressed twice on the same lines gives back the text as it was, with no list', async () => {
    renderEditor();
    select('Soup\nStew');

    await user.click(button('List item'));
    await user.click(button('List item'));

    expect(menuField()).toHaveValue('Soup\nStew');
    expect(within(preview()).queryByRole('list')).not.toBeInTheDocument();
  });

  it('with nothing selected, pressing Bold or Italic again closes the formatting before going on', async () => {
    renderEditor();
    await user.click(menuField());

    await user.click(button('Bold'));
    await user.keyboard('Polenta ');
    await user.click(button('Italic'));
    await user.keyboard('with');
    await user.click(button('Italic'));
    await user.keyboard(' mushrooms');

    expect(menuField()).toHaveValue('**Polenta *with* mushrooms**');
    expect(within(preview()).getByText('Polenta').tagName).toBe('STRONG');
    const withText = within(preview()).getByText('with');
    expect(withText.tagName).toBe('EM');
    expect(withText.parentElement.tagName).toBe('STRONG');
    expect(within(preview()).getByText('mushrooms').tagName).toBe('STRONG');
    expect(preview()).not.toHaveTextContent('*');
  });
});

describe('MenuEditorDialog – saving', () => {
  it('"Save menu" sends the text without the spaces at the ends, then onSaved(slot, false)', async () => {
    const updated = slot({ menu: 'Polenta' });
    vi.mocked(slotsApi.setSlotMenu).mockResolvedValue(updated);
    const { onSaved, onHide } = renderEditor();
    await user.type(menuField(), '  Polenta  ');

    await user.click(button('Save menu'));

    expect(slotsApi.setSlotMenu).toHaveBeenCalledWith(3, 'Polenta');
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated, false));
    expect(onHide).not.toHaveBeenCalled();
  });

  it('"Remove menu" asks first: "Remove the menu of this slot?", with the focus on "Keep it"', async () => {
    renderEditor({ menu: 'Soup' });

    await user.click(button('Remove menu'));

    expect(within(dialog()).getByText('Remove the menu of this slot?')).toBeInTheDocument();
    await waitFor(() => expect(button('Keep it')).toHaveFocus());
    expect(button('Yes, remove')).toBeEnabled();
    expect(within(dialog()).queryByRole('button', { name: 'Save menu' })).not.toBeInTheDocument();
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
  });

  it('"Keep it" goes back to the editor without saving', async () => {
    const { onSaved } = renderEditor({ menu: 'Soup' });
    await user.click(button('Remove menu'));

    await user.click(button('Keep it'));

    expect(within(dialog()).queryByText('Remove the menu of this slot?')).not.toBeInTheDocument();
    expect(button('Remove menu')).toBeEnabled();
    expect(button('Save menu')).toBeEnabled();
    expect(menuField()).toHaveValue('Soup');
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('"Yes, remove" sends null, shows "Removing…" while saving, then onSaved(slot, true)', async () => {
    const removing = deferred();
    vi.mocked(slotsApi.setSlotMenu).mockReturnValue(removing.promise);
    const { onSaved } = renderEditor({ menu: 'Soup' });
    await user.click(button('Remove menu'));

    await user.click(button('Yes, remove'));

    expect(slotsApi.setSlotMenu).toHaveBeenCalledWith(3, null);
    expect(button('Removing…')).toBeDisabled();
    expect(button('Keep it')).toBeDisabled();
    const updated = slot({ menu: null });
    removing.resolve(updated);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated, true));
  });

  it('a server error while removing is shown with the focus, back to the editor buttons', async () => {
    vi.mocked(slotsApi.setSlotMenu).mockRejectedValue(new ApiError(409, 'The menu of a slot that has started cannot be changed'));
    const { onSaved } = renderEditor({ menu: 'Soup' });
    await user.click(button('Remove menu'));

    await user.click(button('Yes, remove'));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('The menu of a slot that has started cannot be changed');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(within(dialog()).queryByText('Remove the menu of this slot?')).not.toBeInTheDocument();
    expect(button('Remove menu')).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a server error is shown with the focus, and the fields can be used again', async () => {
    vi.mocked(slotsApi.setSlotMenu).mockRejectedValue(new ApiError(404, 'Slot not found'));
    const { onSaved } = renderEditor({ menu: 'Soup' });

    await user.click(button('Save menu'));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('Slot not found');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(onSaved).not.toHaveBeenCalled();
    expect(menuField()).toBeEnabled();
    expect(button('Save menu')).toBeEnabled();
    expect(button('Remove menu')).toBeEnabled();
    expect(button('Cancel')).toBeEnabled();
  });

  it('while saving: "Saving…", every control disabled, no close, Escape ignored, a second submit ignored', async () => {
    const saving = deferred();
    vi.mocked(slotsApi.setSlotMenu).mockReturnValue(saving.promise);
    const { onHide, onSaved } = renderEditor({ menu: 'Soup' });

    await user.click(button('Save menu'));

    expect(button('Saving…')).toBeDisabled();
    expect(button('Cancel')).toBeDisabled();
    expect(button('Remove menu')).toBeDisabled();
    expect(button('Reuse a previous menu')).toBeDisabled();
    for (const name of ['Bold', 'Italic', 'List item', 'Sub-item']) expect(button(name)).toBeDisabled();
    expect(menuField()).toBeDisabled();
    expect(within(dialog()).queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onHide).not.toHaveBeenCalled();

    fireEvent.submit(button('Saving…').closest('form'));
    saving.resolve(slot({ menu: 'Soup' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(slotsApi.setSlotMenu).toHaveBeenCalledTimes(1);
  });

  it('Cancel calls onHide without saving', async () => {
    const { onHide } = renderEditor({ menu: 'Soup' });
    await user.click(button('Cancel'));
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
  });

  it('Escape and the close button call onHide without saving', async () => {
    const { onHide } = renderEditor();
    await user.keyboard('{Escape}');
    await user.click(button('Close'));
    expect(onHide).toHaveBeenCalledTimes(2);
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled();
  });
});

describe('MenuEditorDialog – reuse a previous menu', () => {
  const lunch = { menu: 'Barley soup\n- Tart', slotId: 8, date: '2026-11-03', startTime: '12:00', label: 'Lunch' };

  it('opens and closes the list of previous menus', async () => {
    renderEditor();
    const toggle = button('Reuse a previous menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(slotsApi.listPreviousMenus).not.toHaveBeenCalled();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Hide previous menus');
    expect(within(dialog()).getByRole('searchbox', { name: 'Search previous menus' })).toBeInTheDocument();
    await waitFor(() => expect(slotsApi.listPreviousMenus).toHaveBeenCalledWith(''));

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog()).queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('"Use this menu" copies the text into the editor and says so; the next change clears the message', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([lunch]);
    renderEditor({ menu: 'Soup' });
    await user.click(button('Reuse a previous menu'));

    await user.click(await within(dialog()).findByRole('button', { name: 'Use this menu: Lunch, Tue 3 Nov 12:00' }));

    expect(menuField()).toHaveValue('Barley soup\n- Tart');
    expect(within(preview()).getByRole('listitem')).toHaveTextContent('Tart');
    const copied = 'Menu of Lunch, Tue 3 Nov copied: change it if needed, then save.';
    expect(within(dialog()).getByText(copied)).toBeInTheDocument();
    expect(button('Reuse a previous menu')).toHaveAttribute('aria-expanded', 'false');
    expect(slotsApi.setSlotMenu).not.toHaveBeenCalled(); // not saved until "Save menu"

    await user.type(menuField(), '!');
    expect(within(dialog()).queryByText(copied)).not.toBeInTheDocument();
  });

  it('a toolbar change also clears the "copied" message', async () => {
    vi.mocked(slotsApi.listPreviousMenus).mockResolvedValue([lunch]);
    renderEditor();
    await user.click(button('Reuse a previous menu'));
    await user.click(await within(dialog()).findByRole('button', { name: /^Use this menu: Lunch/ }));
    expect(within(dialog()).getByText(/^Menu of Lunch/)).toBeInTheDocument();

    await user.click(button('Bold'));

    expect(within(dialog()).queryByText(/^Menu of Lunch/)).not.toBeInTheDocument();
  });
});
