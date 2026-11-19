import { describe, expect, it } from 'vitest';
import {
  isSelectableState,
  isSlotPickerComplete,
  slotOptionLabel,
  slotOptionState,
  slotPickerValueFromParams,
  slotPickerValueToParams,
  validateSlotPicker,
} from '../../../src/utils/slotPicker.js';

const lunch = { id: 4, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' };
const params = (query) => new URLSearchParams(query);
const valid = { date: '2026-11-06', slotId: 4, partySize: '3' };

describe('slotOptionState (MH-06 Change booking: the new slot needs 48 h notice)', () => {
  // Lunch on Thu 5 Nov at 12:00; exactly 48 h before is Tue 3 Nov at 12:00.
  const at = (day, hours, minutes) => new Date(2026, 10, day, hours, minutes);
  const notice = (now) => ({ minNoticeHours: 48, now });

  it('less than the notice before the start is tooSoon; exactly the notice is still allowed', () => {
    expect(slotOptionState(lunch, '2026-11-05', notice(at(3, 12, 1)))).toBe('tooSoon');
    expect(slotOptionState(lunch, '2026-11-05', notice(at(3, 12, 0)))).toBe('bookable');
    expect(slotOptionState({ ...lunch, bookingState: 'full' }, '2026-11-05', notice(at(3, 12, 0)))).toBe('full');
  });

  it('the booking\'s own slot is "current", even when it is too soon; without options it is the bookingState', () => {
    expect(slotOptionState(lunch, '2026-11-05', { currentSlotId: 4, ...notice(at(5, 11, 0)) })).toBe('current');
    expect(slotOptionState(lunch, '2026-11-05')).toBe('bookable');
  });

  it('only bookable and current options can be chosen', () => {
    expect(['bookable', 'current', 'tooSoon', 'full', 'tooLate'].map(isSelectableState))
      .toEqual([true, true, false, false, false]);
  });

  it('a tooSoon option says how much notice is needed', () => {
    expect(slotOptionLabel(lunch, 'tooSoon', 48)).toBe('Lunch, 12:00 – 14:00 – less than 48 hours away');
  });
});

describe('slotOptionLabel', () => {
  it('shows label and time of a bookable slot, without a suffix', () => {
    expect(slotOptionLabel(lunch)).toBe('Lunch, 12:00 – 14:00');
  });

  it('says why a slot cannot be chosen', () => {
    expect(slotOptionLabel({ ...lunch, bookingState: 'full' })).toBe('Lunch, 12:00 – 14:00 – full');
    expect(slotOptionLabel({ ...lunch, bookingState: 'tooLate' })).toBe('Lunch, 12:00 – 14:00 – booking closed');
  });

  it('shows only the time of a slot without a label', () => {
    expect(slotOptionLabel({ ...lunch, label: '' })).toBe('12:00 – 14:00');
    expect(slotOptionLabel({ ...lunch, label: null, bookingState: 'full' })).toBe('12:00 – 14:00 – full');
  });
});

describe('slotPickerValueFromParams', () => {
  it('reads date, slotId (as a number) and partySize', () => {
    expect(slotPickerValueFromParams(params('date=2026-11-06&slotId=12&partySize=3'))).toEqual({
      date: '2026-11-06',
      slotId: 12,
      partySize: '3',
    });
  });

  it('gives empty fields when the URL has none', () => {
    expect(slotPickerValueFromParams(params(''))).toEqual({ date: '', slotId: null, partySize: '' });
  });

  it.each(['2026-02-30', 'ciao', '2026-11-6', ''])('drops the invalid date %j', (date) => {
    expect(slotPickerValueFromParams(params(`date=${date}&slotId=1&partySize=2`)).date).toBe('');
  });

  it.each(['0', '-1', '1.5', 'abc', '', '01'])('drops the invalid slotId %j', (slotId) => {
    expect(slotPickerValueFromParams(params(`date=2026-11-06&slotId=${slotId}&partySize=2`)).slotId).toBeNull();
  });

  it.each(['0', 'abc', '1.5', '-2', ''])('drops the invalid partySize %j', (partySize) => {
    expect(slotPickerValueFromParams(params(`date=2026-11-06&slotId=1&partySize=${partySize}`)).partySize).toBe('');
  });
});

describe('slotPickerValueToParams', () => {
  it('writes every field', () => {
    expect(slotPickerValueToParams(valid).toString()).toBe('date=2026-11-06&slotId=4&partySize=3');
  });

  it('leaves out the empty fields', () => {
    expect(slotPickerValueToParams({ date: '', slotId: null, partySize: '' }).toString()).toBe('');
    expect(slotPickerValueToParams({ date: '2026-11-06', slotId: null, partySize: '' }).toString()).toBe(
      'date=2026-11-06',
    );
  });

  it('trims the party size, also when it is a number', () => {
    expect(slotPickerValueToParams({ ...valid, partySize: ' 3 ' }).get('partySize')).toBe('3');
    expect(slotPickerValueToParams({ ...valid, partySize: 5 }).get('partySize')).toBe('5');
  });

  it('round-trips with slotPickerValueFromParams', () => {
    expect(slotPickerValueFromParams(slotPickerValueToParams(valid))).toEqual(valid);
  });
});

describe('validateSlotPicker', () => {
  it('finds no error in a complete value', () => {
    expect(validateSlotPicker(valid)).toEqual({});
  });

  it('gives each field its own message', () => {
    expect(validateSlotPicker({ date: '', slotId: null, partySize: '' })).toEqual({
      date: 'Choose a date.',
      slotId: 'Choose a time.',
      partySize: 'Enter the number of people, at least 1.',
    });
  });

  it('accepts a party size with spaces around it, or a number', () => {
    expect(validateSlotPicker({ ...valid, partySize: ' 3 ' })).toEqual({});
    expect(validateSlotPicker({ ...valid, partySize: 3 })).toEqual({});
  });

  it.each(['', '0', '-2', '1.5', 'abc', null, undefined])('refuses the party size %j', (partySize) => {
    expect(validateSlotPicker({ ...valid, partySize })).toEqual({
      partySize: 'Enter the number of people, at least 1.',
    });
  });
});

describe('isSlotPickerComplete', () => {
  it('is true only when the three fields are valid', () => {
    expect(isSlotPickerComplete(valid)).toBe(true);
    expect(isSlotPickerComplete({ ...valid, slotId: null })).toBe(false);
    expect(isSlotPickerComplete({ ...valid, partySize: '0' })).toBe(false);
  });
});
