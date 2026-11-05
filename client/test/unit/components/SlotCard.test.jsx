// The card of one slot in the week view (MH-02 FE1), on its own: summary, "Past", tables when open.
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
