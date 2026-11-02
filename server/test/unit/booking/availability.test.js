import { describe, expect, it } from 'vitest';
import { allocate, bookingClosed, freeSeats } from '../../../src/services/availability.js';

describe('allocate', () => {
  it.each([0, -1, 1.5])('rejects invalid party size %s', (partySize) => {
    expect(() => allocate([{ id: 1, seats: 4 }], [], partySize)).toThrow(RangeError);
  });

  it('chooses the 8-seat table for a party of 8 in an 8/4/4 plan', () => {
    const tables = [
      { id: 1, seats: 8 },
      { id: 2, seats: 4 },
      { id: 3, seats: 4 },
    ];

    expect(allocate(tables, [], 8)).toEqual([{ slotTableId: 1, seats: 8 }]);
  });

  it('chooses both 4-seat tables for a party of 8 in a 6/4/4 plan', () => {
    const tables = [
      { id: 1, seats: 6 },
      { id: 2, seats: 4 },
      { id: 3, seats: 4 },
    ];

    expect(allocate(tables, [], 8)).toEqual([
      { slotTableId: 2, seats: 4 },
      { slotTableId: 3, seats: 4 },
    ]);
  });

  it('chooses the 6-seat table for a party of 5 in a 6/4/4 plan', () => {
    const tables = [
      { id: 1, seats: 6 },
      { id: 2, seats: 4 },
      { id: 3, seats: 4 },
    ];

    expect(allocate(tables, [], 5)).toEqual([{ slotTableId: 1, seats: 5 }]);
  });

  it('allocates a party that exactly matches a table\'s free seats', () => {
    const tables = [
      { id: 1, seats: 6 },
      { id: 2, seats: 4 },
    ];
    const allocations = [{ slotTableId: 1, seats: 2 }];

    expect(freeSeats(tables, allocations)).toBe(8);
    expect(allocate(tables, allocations, 4)).toEqual([{ slotTableId: 1, seats: 4 }]);
  });

  it('does not allocate a party one larger than a table\'s free seats to that table', () => {
    const tables = [{ id: 1, seats: 6 }];
    const allocations = [{ slotTableId: 1, seats: 2 }];

    expect(allocate(tables, allocations, 5)).toBeNull();
  });

  it('skips a fully taken table and allocates from a free one', () => {
    const tables = [
      { id: 1, seats: 4 },
      { id: 2, seats: 4 },
    ];
    const allocations = [{ slotTableId: 1, seats: 4 }];

    expect(allocate(tables, allocations, 4)).toEqual([{ slotTableId: 2, seats: 4 }]);
  });

  it('returns no free seats and no allocation when all tables are full', () => {
    const tables = [
      { id: 1, seats: 4 },
      { id: 2, seats: 4 },
    ];
    const allocations = [
      { slotTableId: 1, seats: 4 },
      { slotTableId: 2, seats: 4 },
    ];

    expect(freeSeats(tables, allocations)).toBe(0);
    expect(allocate(tables, allocations, 1)).toBeNull();
  });

  it('allocates a party equal to all remaining seats across the slot', () => {
    const tables = [
      { id: 1, seats: 6 },
      { id: 2, seats: 4 },
    ];
    const allocations = [{ slotTableId: 1, seats: 2 }];

    expect(allocate(tables, allocations, 8)).toEqual([
      { slotTableId: 1, seats: 4 },
      { slotTableId: 2, seats: 4 },
    ]);
  });

  it('does not allocate a party larger than all remaining seats across the slot', () => {
    const tables = [
      { id: 1, seats: 6 },
      { id: 2, seats: 4 },
    ];
    const allocations = [{ slotTableId: 1, seats: 2 }];

    expect(allocate(tables, allocations, 9)).toBeNull();
  });
});

describe('bookingClosed', () => {
  const slot = { date: '2026-11-02', startTime: '14:00' };

  it('keeps booking open exactly two hours before the slot', () => {
    expect(bookingClosed(slot, new Date(2026, 10, 2, 12, 0))).toBe(false);
  });

  it('closes booking less than two hours before the slot', () => {
    expect(bookingClosed(slot, new Date(2026, 10, 2, 12, 1))).toBe(true);
  });

  it('closes booking already started', () => {
    expect(bookingClosed(slot, new Date(2026, 10, 2, 14, 0))).toBe(true);
  });
});
