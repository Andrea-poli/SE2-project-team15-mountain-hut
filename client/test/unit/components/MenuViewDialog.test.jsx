// MH-10 FT1 – MenuViewDialog (task MH-10 FE1): the menu of a slot with the slot it belongs to; Close, the close
// button and Escape call onHide; "Edit menu" calls onEdit(slot).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MenuViewDialog from '../../../src/components/MenuViewDialog.jsx';

const slot = {
  id: 3,
  date: '2026-11-05',
  startTime: '19:00',
  endTime: '20:30',
  label: 'Dinner',
  status: 'open',
  past: false,
  menu: '**Venison stew**\n- Blueberry tart',
  tables: [{ id: 1, name: 'T1', seats: 4 }],
};

function renderDialog() {
  const onHide = vi.fn();
  const onEdit = vi.fn();
  render(<MenuViewDialog slot={slot} onHide={onHide} onEdit={onEdit} />);
  return { onHide, onEdit, dialog: screen.getByRole('dialog', { name: /^Menu/ }) };
}

describe('MenuViewDialog', () => {
  it('shows the menu, formatted, and the slot it belongs to', () => {
    const { dialog } = renderDialog();
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('MenuDinner, Thu 5 Nov, 19:00 – 20:30');
    expect(within(dialog).getByText('Venison stew').tagName).toBe('STRONG');
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('Blueberry tart');
  });

  it('both Close buttons (footer and header) call onHide', async () => {
    const { dialog, onHide, onEdit } = renderDialog();
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Close' });
    expect(closeButtons).toHaveLength(2);
    for (const button of closeButtons) await userEvent.click(button);
    expect(onHide).toHaveBeenCalledTimes(2);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('Escape calls onHide', async () => {
    const { onHide } = renderDialog();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalled();
  });

  it('"Edit menu" calls onEdit with the slot', async () => {
    const { dialog, onHide, onEdit } = renderDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit menu' }));
    expect(onEdit).toHaveBeenCalledWith(slot);
    expect(onHide).not.toHaveBeenCalled();
  });
});
