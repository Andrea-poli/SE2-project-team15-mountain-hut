import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/client.js';
import * as publicSlotsApi from '../../../src/api/publicSlots.js';
import SlotPicker from '../../../src/components/SlotPicker.jsx';

vi.mock('../../../src/api/publicSlots.js', () => ({ listPublicSlots: vi.fn() }));

const TODAY = new Date(2026, 10, 3, 10, 0); // Tue 3 Nov 2026, 10:00
const EMPTY = { date: '', slotId: null, partySize: '' };
const TIME_HELP = 'Full slots and slots starting in less than 2 hours cannot be chosen.';

const slot = (id, label, startTime, endTime, bookingState = 'bookable') => ({ id, label, startTime, endTime, bookingState });
const NOV_6 = [
  slot(10, 'Lunch', '12:00', '14:00'),
  slot(11, 'Dinner – 1st turn', '19:00', '20:30', 'full'),
  slot(12, '', '21:00', '22:30', 'tooLate'),
];
const NOV_7 = [slot(20, 'Lunch', '12:00', '14:00'), slot(21, 'Dinner – 2nd turn', '20:30', '22:00')];

// The parent keeps the value in a state, as BookPage does; onChange is also reported to a spy.
function Harness({ initial, onChange, ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <SlotPicker
      idPrefix="book"
      today={TODAY}
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      {...props}
    />
  );
}

function renderPicker({ initial = EMPTY, ...props } = {}) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} {...props} />);
  return { onChange };
}

/** A promise the test resolves or rejects when it wants. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const dateField = () => screen.getByLabelText('Date');
const timeMenu = () => screen.getByRole('combobox', { name: 'Time' });

async function chooseDate(date) {
  await userEvent.clear(dateField());
  await userEvent.type(dateField(), date);
}

describe('SlotPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(publicSlotsApi.listPublicSlots).mockImplementation(async (date) => (date === '2026-11-07' ? NOV_7 : NOV_6));
  });

  it('shows three labelled, required fields in a fieldset, the date not before today', () => {
    renderPicker();
    const group = screen.getByRole('group', { name: 'Date, time and party size' });
    expect(within(group).getByLabelText('Date')).toBeRequired();
    expect(within(group).getByLabelText('Time')).toBeRequired();
    expect(within(group).getByLabelText('Number of people')).toBeRequired();
    expect(dateField()).toHaveAttribute('type', 'date');
    expect(dateField()).toHaveAttribute('min', '2026-11-03');
    expect(dateField()).toHaveAttribute('id', 'book-date');
    expect(timeMenu()).toHaveAttribute('id', 'book-time');
    const party = screen.getByLabelText('Number of people');
    expect(party).toHaveAttribute('id', 'book-party-size');
    expect(party).toHaveAttribute('type', 'number');
    expect(party).toHaveAttribute('min', '1');
    expect(party).toHaveAccessibleDescription('Everyone in your party, you included.');
  });

  it('before a date is chosen: time menu disabled, no request', () => {
    renderPicker();
    expect(timeMenu()).toBeDisabled();
    expect(within(timeMenu()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a date first']);
    expect(timeMenu()).toHaveAccessibleDescription(TIME_HELP);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(publicSlotsApi.listPublicSlots).not.toHaveBeenCalled();
  });

  it('loads the slots of the chosen day and lists one option per slot', async () => {
    const answer = deferred();
    vi.mocked(publicSlotsApi.listPublicSlots).mockReturnValue(answer.promise);
    renderPicker();
    await chooseDate('2026-11-06');

    expect(publicSlotsApi.listPublicSlots).toHaveBeenCalledTimes(1);
    expect(publicSlotsApi.listPublicSlots).toHaveBeenCalledWith('2026-11-06');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(timeMenu()).toBeDisabled();

    answer.resolve(NOV_6);
    await waitFor(() => expect(timeMenu()).toBeEnabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(within(timeMenu()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a time',
      'Lunch, 12:00 – 14:00',
      'Dinner – 1st turn, 19:00 – 20:30 – full',
      '21:00 – 22:30 – booking closed',
    ]);
  });

  it('shows full and closed slots, but only a bookable slot can be chosen', async () => {
    renderPicker();
    await chooseDate('2026-11-06');
    await waitFor(() => expect(timeMenu()).toBeEnabled());
    expect(screen.getByRole('option', { name: 'Lunch, 12:00 – 14:00' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Dinner – 1st turn, 19:00 – 20:30 – full' })).toBeDisabled();
    expect(screen.getByRole('option', { name: '21:00 – 22:30 – booking closed' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Choose a time' })).toBeEnabled();
  });

  it('says so on a day without slots, without a time menu', async () => {
    vi.mocked(publicSlotsApi.listPublicSlots).mockResolvedValue([]);
    renderPicker();
    await chooseDate('2026-11-09');
    expect(await screen.findByText('No meal service on this day.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(TIME_HELP)).not.toBeInTheDocument();
  });

  it('shows a server error as an alert', async () => {
    vi.mocked(publicSlotsApi.listPublicSlots).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    renderPicker();
    await chooseDate('2026-11-06');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(timeMenu()).toBeDisabled();
  });

  it('reports the chosen slot id as a number, and a new date empties the time', async () => {
    const { onChange } = renderPicker();
    await chooseDate('2026-11-06');
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-06', slotId: null, partySize: '' });
    await waitFor(() => expect(timeMenu()).toBeEnabled());

    await userEvent.selectOptions(timeMenu(), 'Lunch, 12:00 – 14:00');
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-06', slotId: 10, partySize: '' });
    expect(timeMenu()).toHaveValue('10');

    await userEvent.type(screen.getByLabelText('Number of people'), '4');
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-06', slotId: 10, partySize: '4' });

    await userEvent.selectOptions(timeMenu(), 'Choose a time');
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-06', slotId: null, partySize: '4' });
    await userEvent.selectOptions(timeMenu(), 'Lunch, 12:00 – 14:00');

    // The new day is still loading: the time is already empty, not the old slot of 6 Nov
    // (a submit now would otherwise book the wrong day).
    const nov7 = deferred();
    vi.mocked(publicSlotsApi.listPublicSlots).mockReturnValue(nov7.promise);
    onChange.mockClear();
    await chooseDate('2026-11-07');
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-07', slotId: null, partySize: '4' });
    for (const [next] of onChange.mock.calls) expect(next.slotId, `date ${next.date}`).toBeNull();
    nov7.resolve(NOV_7);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Dinner – 2nd turn, 20:30 – 22:00' })).toBeInTheDocument());
    expect(timeMenu()).toHaveValue('');
  });

  it('never shows the slots of the previous day while the new day loads', async () => {
    const nov7 = deferred();
    vi.mocked(publicSlotsApi.listPublicSlots).mockImplementation((date) =>
      date === '2026-11-07' ? nov7.promise : Promise.resolve(NOV_6),
    );
    renderPicker();
    await chooseDate('2026-11-06');
    expect(await screen.findByRole('option', { name: 'Lunch, 12:00 – 14:00' })).toBeInTheDocument();

    await chooseDate('2026-11-07');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('option', { name: 'Lunch, 12:00 – 14:00' })).not.toBeInTheDocument();
    expect(timeMenu()).toBeDisabled();

    nov7.resolve(NOV_7);
    expect(await screen.findByRole('option', { name: 'Dinner – 2nd turn, 20:30 – 22:00' })).toBeInTheDocument();
  });

  it('ignores an old answer that arrives after the answer for the new day', async () => {
    const answers = { '2026-11-06': deferred(), '2026-11-07': deferred() };
    vi.mocked(publicSlotsApi.listPublicSlots).mockImplementation((date) => answers[date].promise);
    renderPicker();
    await chooseDate('2026-11-06');
    await chooseDate('2026-11-07');
    expect(publicSlotsApi.listPublicSlots.mock.calls).toEqual([['2026-11-06'], ['2026-11-07']]);

    answers['2026-11-07'].resolve(NOV_7);
    expect(await screen.findByRole('option', { name: 'Dinner – 2nd turn, 20:30 – 22:00' })).toBeInTheDocument();
    answers['2026-11-06'].resolve(NOV_6);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(within(timeMenu()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a time',
      'Lunch, 12:00 – 14:00',
      'Dinner – 2nd turn, 20:30 – 22:00',
    ]);
    expect(screen.queryByRole('option', { name: /full|booking closed/ })).not.toBeInTheDocument();
  });

  it.each([
    ['full', 11],
    ['booking closed', 12],
    ['not on that day', 99],
  ])('drops a prefilled slot that cannot be booked (%s)', async (_case, slotId) => {
    const { onChange } = renderPicker({ initial: { date: '2026-11-06', slotId, partySize: '2' } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ date: '2026-11-06', slotId: null, partySize: '2' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(timeMenu()).toHaveValue('');
    expect(screen.getByLabelText('Number of people')).toHaveValue(2);
  });

  it('keeps a prefilled bookable slot selected', async () => {
    const { onChange } = renderPicker({ initial: { date: '2026-11-06', slotId: 10, partySize: '2' } });
    expect(dateField()).toHaveValue('2026-11-06');
    await waitFor(() => expect(timeMenu()).toBeEnabled());
    expect(timeMenu()).toHaveValue('10');
    expect(screen.getByRole('option', { name: 'Lunch, 12:00 – 14:00' }).selected).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the errors it receives under each field, error first in the description', async () => {
    renderPicker({
      initial: { date: '2026-11-06', slotId: null, partySize: '' },
      errors: { date: 'Choose a date.', slotId: 'Choose a time.', partySize: 'Enter the number of people, at least 1.' },
    });
    await waitFor(() => expect(timeMenu()).toBeEnabled());

    expect(dateField()).toHaveAttribute('aria-invalid', 'true');
    expect(dateField()).toHaveAccessibleDescription('Choose a date.');
    expect(timeMenu()).toHaveAttribute('aria-invalid', 'true');
    expect(timeMenu()).toHaveAccessibleDescription(`Choose a time. ${TIME_HELP}`);
    const party = screen.getByLabelText('Number of people');
    expect(party).toHaveAttribute('aria-invalid', 'true');
    expect(party).toHaveAccessibleDescription('Enter the number of people, at least 1. Everyone in your party, you included.');
  });

  it('reports which field the user leaves', async () => {
    const onBlurField = vi.fn();
    renderPicker({ initial: { date: '2026-11-06', slotId: null, partySize: '' }, onBlurField });
    await waitFor(() => expect(timeMenu()).toBeEnabled());

    await userEvent.click(dateField());
    await userEvent.tab();
    expect(onBlurField.mock.calls).toEqual([['date']]);
    expect(timeMenu()).toHaveFocus();
    await userEvent.tab();
    expect(onBlurField.mock.calls).toEqual([['date'], ['slotId']]);
    expect(screen.getByLabelText('Number of people')).toHaveFocus();
    await userEvent.tab();
    expect(onBlurField.mock.calls).toEqual([['date'], ['slotId'], ['partySize']]);
  });

  it('works without onBlurField', async () => {
    renderPicker({ initial: { date: '2026-11-06', slotId: null, partySize: '' } });
    await waitFor(() => expect(timeMenu()).toBeEnabled());
    await userEvent.click(dateField());
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByLabelText('Number of people')).not.toHaveFocus();
  });
});
