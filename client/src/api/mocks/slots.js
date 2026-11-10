// Mocks of the slots endpoints (VITE_USE_MOCKS=true): API-shaped slots kept in memory.
import { addDays, startOfWeek, toLocalIsoDate } from '../../utils/format.js';

const today = new Date();
const currentWeekStart = startOfWeek(today);
const currentDate = toLocalIsoDate(today);
const currentTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
const currentDayOfWeek = (today.getDay() + 6) % 7;

const mockSlotDefinitions = [
  {
    day: 0,
    startTime: '08:00',
    endTime: '09:30',
    label: 'Breakfast service - early seating',
    tables: [
      { name: 'Table 1 with a long name', seats: 4 },
      { name: 'T2', seats: 4 },
      { name: 'T3', seats: 2 },
    ],
  },
  {
    day: 0,
    startTime: '12:00',
    endTime: '14:00',
    label: 'Mountain lunch - first sitting',
    tables: [
      { name: 'T1', seats: 6 },
      { name: 'T2', seats: 4 },
      { name: 'T3', seats: 4 },
      { name: 'T4', seats: 6 },
      { name: 'T5', seats: 8 },
    ],
  },
  {
    day: 1,
    startTime: '12:00',
    endTime: '14:00',
    label: 'Lunch',
    tables: [
      { name: 'T1', seats: 4 },
      { name: 'T2', seats: 6 },
      { name: 'T3', seats: 2 },
    ],
  },
  {
    day: 1,
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner service - evening seating',
    tables: [
      { name: 'T1', seats: 6 },
      { name: 'T2', seats: 4 },
      { name: 'T3', seats: 4 },
      { name: 'T4', seats: 2 },
    ],
  },
  {
    day: 2,
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner',
    tables: [
      { name: 'T1', seats: 1 },
    ],
  },
  {
    day: 4,
    startTime: '08:00',
    endTime: '10:00',
    label: 'Breakfast',
    tables: [
      { name: 'T1', seats: 4 },
      { name: 'T2', seats: 4 },
      { name: 'T3', seats: 6 },
    ],
  },
  {
    day: 4,
    startTime: '12:00',
    endTime: '14:00',
    label: 'Lunch',
    tables: [
      { name: 'T1', seats: 4 },
      { name: 'T2', seats: 4 },
      { name: 'T3', seats: 6 },
    ],
  },
  {
    day: 4,
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner',
    tables: [
      { name: 'T1', seats: 8 },
      { name: 'T2', seats: 6 },
      { name: 'T3', seats: 1 },
    ],
  },
  {
    day: 4,
    startTime: '20:30',
    endTime: '22:30',
    label: 'Dinner - 2nd turn: special event',
    tables: [
      { name: 'Unique table', seats: 25 },
    ],
  },
];

if (!mockSlotDefinitions.some((definition) => definition.day === currentDayOfWeek)) {
  mockSlotDefinitions.push(
    {
      day: currentDayOfWeek,
      startTime: '12:00',
      endTime: '14:00',
      label: 'Lunch',
      tables: [
        { name: 'T1', seats: 4 },
        { name: 'T2', seats: 6 },
        { name: 'T3', seats: 2 },
      ],
    },
    {
      day: currentDayOfWeek,
      startTime: '19:00',
      endTime: '20:30',
      label: 'Dinner',
      tables: [
        { name: 'T1', seats: 8 },
        { name: 'T2', seats: 4 },
        { name: 'T3', seats: 4 },
      ],
    },
  );
}

const mockSlots = mockSlotDefinitions.map((definition, index) => {
  const date = toLocalIsoDate(addDays(currentWeekStart, definition.day));
  return {
    id: index + 1,
    date,
    startTime: definition.startTime,
    endTime: definition.endTime,
    label: definition.label,
    status: 'open',
    past: date < currentDate || (date === currentDate && definition.startTime <= currentTime),
    tables: definition.tables.map((table, tableIndex) => ({
      id: index * 10 + tableIndex + 1,
      name: table.name,
      seats: table.seats,
    })),
  };
});

// Same order as the server (ORDER BY date, start_time, id): created or copied slots appear in the right place.
export async function listSlots(from, to) {
  return mockSlots
    .filter((slot) => slot.date >= from && slot.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id - b.id);
}

export async function createSlot(slot) {
  if (mockSlots.some((existing) =>
    existing.date === slot.date && slot.startTime < existing.endTime && slot.endTime > existing.startTime
  )) {
    const error = new Error('Overlaps an existing slot');
    error.status = 409;
    throw error;
  }

  const created = {
    ...slot,
    id: Math.max(0, ...mockSlots.map(({ id }) => id)) + 1,
    status: 'open',
    past: false,
    tables: slot.tables.map((table, index) => ({
      ...table,
      id: Date.now() + index,
    })),
  };
  mockSlots.push(created);
  return created;
}

// Mock of POST /api/slots/copy-week: same rules as the server. `from` and `to` are any day of the two weeks.
export async function copyWeek(from, to) {
  const toLocalDate = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const sourceStart = startOfWeek(toLocalDate(from));
  const targetStart = startOfWeek(toLocalDate(to));
  const sourceFrom = toLocalIsoDate(sourceStart);
  const sourceTo = toLocalIsoDate(addDays(sourceStart, 6));
  if (sourceFrom === toLocalIsoDate(targetStart)) {
    const error = new Error('Choose a different week to copy into');
    error.status = 400;
    throw error;
  }

  // Whole days between the two Mondays: Math.round absorbs the hour gained or lost with daylight saving time.
  const shift = Math.round((targetStart - sourceStart) / 86400000);
  const now = new Date();
  const nowDate = toLocalIsoDate(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const created = [];
  const skipped = [];

  const sourceSlots = mockSlots
    .filter((slot) => slot.date >= sourceFrom && slot.date <= sourceTo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  for (const slot of sourceSlots) {
    const date = toLocalIsoDate(addDays(toLocalDate(slot.date), shift));
    const { startTime, endTime, label } = slot;
    if (date < nowDate || (date === nowDate && startTime <= nowTime)) {
      skipped.push({ date, startTime, endTime, label, reason: 'past' });
    } else if (mockSlots.some((existing) =>
      existing.date === date && startTime < existing.endTime && endTime > existing.startTime
    )) {
      skipped.push({ date, startTime, endTime, label, reason: 'overlap' });
    } else {
      const tableId = Math.max(0, ...mockSlots.flatMap((existing) => existing.tables.map((table) => table.id)));
      const copy = {
        id: Math.max(0, ...mockSlots.map((existing) => existing.id)) + 1,
        date,
        startTime,
        endTime,
        label,
        status: 'open',
        past: false,
        tables: slot.tables.map((table, index) => ({ id: tableId + index + 1, name: table.name, seats: table.seats })),
      };
      mockSlots.push(copy);
      created.push(copy);
    }
  }
  return { created, skipped };
}
