// MH-07 FT1 – the staff option of the slot picker (utils/slotPicker.js pickerSlotState), from PO #35: staff
// have no 2-hour rule, a slot can be booked until it starts, not after. Hikers keep the server's bookingState
// (2-hour rule, openapi PublicSlot). "Now" is the hut's local time.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickerSlotState, slotOptionLabel } from '../../../src/utils/slotPicker.js';

const DAY = '2026-11-03';
const NOW = new Date(2026, 10, 3, 10, 0); // Tue 3 Nov 2026, 10:00
const slot = (startTime, bookingState) => ({ id: 1, label: 'Lunch', startTime, endTime: '23:00', bookingState });

describe('pickerSlotState', () => {
  afterEach(() => vi.useRealTimers());

  it('hikers: the state sent by the server, unchanged', () => {
    for (const state of ['bookable', 'full', 'tooLate']) {
      expect(pickerSlotState(slot('11:30', state), DAY, { now: NOW })).toBe(state);
    }
    expect(pickerSlotState(slot('11:30', 'tooLate'), DAY)).toBe('tooLate');
  });

  it('staff: a slot closed by the 2-hour rule can be chosen until it starts', () => {
    expect(pickerSlotState(slot('11:30', 'tooLate'), DAY, { untilStart: true, now: NOW })).toBe('bookable');
    expect(pickerSlotState(slot('10:01', 'tooLate'), DAY, { untilStart: true, now: NOW })).toBe('bookable');
  });

  it('staff: a slot is "started" from its start time on', () => {
    expect(pickerSlotState(slot('10:00', 'tooLate'), DAY, { untilStart: true, now: NOW })).toBe('started');
    expect(pickerSlotState(slot('08:00', 'tooLate'), DAY, { untilStart: true, now: NOW })).toBe('started');
    expect(pickerSlotState(slot('23:00', 'tooLate'), '2026-11-02', { untilStart: true, now: NOW })).toBe('started');
  });

  it('staff: full and bookable slots keep their state', () => {
    expect(pickerSlotState(slot('19:00', 'full'), DAY, { untilStart: true, now: NOW })).toBe('full');
    expect(pickerSlotState(slot('19:00', 'bookable'), DAY, { untilStart: true, now: NOW })).toBe('bookable');
  });

  it('staff: "now" is the current time when not given', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    expect(pickerSlotState(slot('11:30', 'tooLate'), DAY, { untilStart: true })).toBe('bookable');
    expect(pickerSlotState(slot('09:59', 'tooLate'), DAY, { untilStart: true })).toBe('started');
  });
});

describe('slotOptionLabel for a started slot', () => {
  it('says "– started"', () => {
    expect(slotOptionLabel(slot('08:00', 'started'))).toBe('Lunch, 08:00 – 23:00 – started');
  });
});
