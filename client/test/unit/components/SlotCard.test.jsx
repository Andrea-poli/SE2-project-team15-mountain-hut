// The card of one slot in the week view (MH-02 FE1), on its own: summary, "Past", tables when open.
// MH-10 FE1: "Menu set" / "No menu" on the closed card; "View menu" / "Add menu" on the open one.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SlotCard from '../../../src/components/SlotCard.jsx';

const slot = (over = {}) => ({
  id: 3,
  date: '2026-11-05',
  startTime: '19:00',
  endTime: '20:30',
  label: 'Dinner',
  status: 'open',
  past: false,
  tables: [
    { id: 1, name: 'T1', seats: 4 },
    { id: 2, name: 'T2', seats: 6 },
  ],
  ...over,
});

describe('SlotCard', () => {
  it('sums up label, time, tables and seats, in the plural', () => {
    render(<SlotCard slot={slot()} isPastDay={false} expanded={false} onSelect={() => {}} />);
    const button = screen.getByRole('button', { name: /Dinner/ });
    expect(button).toHaveTextContent('19:00 – 20:30');
    expect(button).toHaveTextContent('2 tables');
    expect(button).toHaveTextContent('10 seats');
    expect(button).not.toHaveTextContent('Past');
  });

  it('uses the singular for one table and one seat, also in the open list', () => {
    render(<SlotCard slot={slot({ tables: [{ id: 1, name: 'Bar', seats: 1 }] })} expanded onSelect={() => {}} />);
    const button = screen.getByRole('button', { name: /Dinner/ });
    expect(button).toHaveTextContent('1 table');
    expect(button).not.toHaveTextContent('1 tables');
    expect(button).toHaveTextContent(/1 seat$/);
    expect(screen.getByText('Bar – 1 seat')).toBeInTheDocument();
  });

  it('marks as "Past" a slot of a past day, even if the server did not', () => {
    render(<SlotCard slot={slot({ past: false })} isPastDay expanded={false} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Dinner/ })).toHaveTextContent('Past');
  });

  it('shows the tables only when open, and reports the click', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SlotCard slot={slot()} expanded={false} onSelect={onSelect} />);
    expect(screen.queryByText('T1 – 4 seats')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Dinner/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));

    rerender(<SlotCard slot={slot()} expanded onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Dinner/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('T1 – 4 seats')).toBeInTheDocument();
    expect(screen.getByText('T2 – 6 seats')).toBeInTheDocument();
  });
});

// MH-10 FT1: the closed card says whether the slot has a menu; the open one has "View menu" or "Add menu".
// Found by their text only: icons, colours and the place of the menu line may still change.
describe('SlotCard – menu (MH-10)', () => {
  it('a closed card says "Menu set" when the slot has a menu', () => {
    render(<SlotCard slot={slot({ menu: 'Soup' })} expanded={false} onSelect={() => {}} />);
    const card = screen.getByRole('button', { name: /Dinner/ });
    expect(card).toHaveTextContent('Menu set');
    expect(card).not.toHaveTextContent('No menu');
  });

  it.each([
    ['a future slot', false, false],
    ['a slot that has started', true, false],
    ['a slot of a past day', false, true],
  ])('a closed card says "No menu" when the menu is null: %s', (_case, past, isPastDay) => {
    render(<SlotCard slot={slot({ menu: null, past })} isPastDay={isPastDay} expanded={false} onSelect={() => {}} />);
    const card = screen.getByRole('button', { name: /Dinner/ });
    expect(card).toHaveTextContent('No menu');
    expect(card).not.toHaveTextContent('Menu set');
  });

  it('"Menu set" also on a past card', () => {
    render(<SlotCard slot={slot({ menu: 'Soup', past: true })} isPastDay expanded={false} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Dinner/ })).toHaveTextContent('Menu set');
  });

  it('a closed card has neither "View menu" nor "Add menu"', () => {
    render(<SlotCard slot={slot({ menu: 'Soup' })} expanded={false} onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: 'View menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add menu' })).not.toBeInTheDocument();
  });

  it('an open card with a menu: "View menu" calls onViewMenu(slot)', async () => {
    const onViewMenu = vi.fn();
    const onEditMenu = vi.fn();
    const withMenu = slot({ menu: 'Soup' });
    render(<SlotCard slot={withMenu} expanded onSelect={() => {}} onViewMenu={onViewMenu} onEditMenu={onEditMenu} />);
    expect(screen.queryByRole('button', { name: 'Add menu' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View menu' }));

    expect(onViewMenu).toHaveBeenCalledWith(withMenu);
    expect(onEditMenu).not.toHaveBeenCalled();
  });

  it('an open card without a menu: "Add menu" calls onEditMenu(slot)', async () => {
    const onViewMenu = vi.fn();
    const onEditMenu = vi.fn();
    const withoutMenu = slot({ menu: null });
    render(<SlotCard slot={withoutMenu} expanded onSelect={() => {}} onViewMenu={onViewMenu} onEditMenu={onEditMenu} />);
    expect(screen.queryByRole('button', { name: 'View menu' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add menu' }));

    expect(onEditMenu).toHaveBeenCalledWith(withoutMenu);
    expect(onViewMenu).not.toHaveBeenCalled();
  });
});
