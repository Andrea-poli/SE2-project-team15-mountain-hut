// Mock of GET /api/slots (VITE_USE_MOCKS=true): returns API-shaped slots for the requested range.
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

export async function listSlots(from, to) {
  return mockSlots.filter((slot) => slot.date >= from && slot.date <= to);
}
