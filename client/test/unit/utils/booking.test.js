import { describe, expect, it } from 'vitest';
import { peopleText, seatSplitText } from '../../../src/utils/booking.js';

// Tables as the server returns them (openapi Allocation): the names are never shown.
const table = (seats, tableName = 'T1') => ({ slotTableId: seats * 10, tableName, seats });

describe('seatSplitText', () => {
  it('is empty without tables', () => {
    expect(seatSplitText([])).toBe('');
    expect(seatSplitText(null)).toBe('');
    expect(seatSplitText(undefined)).toBe('');
  });

  it('says "at one table" for a single table, with seat or seats', () => {
    expect(seatSplitText([table(1)])).toBe('1 seat at one table');
    expect(seatSplitText([table(3)])).toBe('3 seats at one table');
  });

  it('lists the seats of each table in order', () => {
    expect(seatSplitText([table(2, 'T1'), table(3, 'T2'), table(1, 'T3')])).toBe('2 + 3 + 1 seats');
    expect(seatSplitText([table(8, 'T5'), table(2, 'T1')])).toBe('8 + 2 seats');
  });
});

describe('peopleText', () => {
  it('uses the singular for one person only', () => {
    expect(peopleText(1)).toBe('1 person');
    expect(peopleText(2)).toBe('2 people');
    expect(peopleText(3)).toBe('3 people');
  });
});
