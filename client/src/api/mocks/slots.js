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
    menu: '**Polenta** with mushrooms\n- Soup of the day\n  - vegetarian on request\n- *Apple strudel*',
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
    menu: 'Tonight:\n- Barley soup\n- **Venison stew** with polenta\n- Blueberry tart',
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
    menu: definition.menu ?? null,
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
    menu: null,
    tables: slot.tables.map((table, index) => ({
      ...table,
      id: Date.now() + index,
    })),
  };
  mockSlots.push(created);
  return created;
}

// Slots with a confirmed booking (the mock has no bookings): the Friday "special event" of the current week, so
// copying a week into the current one answers 409 until that slot starts.
const bookedSlotIds = new Set([9]);

// Mock of POST /api/slots/copy-week: same rules as the server. `sourceWeek` and `targetWeek` are any day of the
// two weeks. The not-started slots of the target week are replaced (409 if one is booked); started ones are kept.
export async function copyWeek(sourceWeek, targetWeek) {
  const toLocalDate = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const sourceStart = startOfWeek(toLocalDate(sourceWeek));
  const targetStart = startOfWeek(toLocalDate(targetWeek));
  const sourceFrom = toLocalIsoDate(sourceStart);
  const sourceTo = toLocalIsoDate(addDays(sourceStart, 6));
  const targetFrom = toLocalIsoDate(targetStart);
  const targetTo = toLocalIsoDate(addDays(targetStart, 6));
  if (sourceFrom === targetFrom) {
    const error = new Error('Choose a different week to copy into');
    error.status = 400;
    throw error;
  }

  // Whole days between the two Mondays: Math.round absorbs the hour gained or lost with daylight saving time.
  const shift = Math.round((targetStart - sourceStart) / 86400000);
  const now = new Date();
  const nowDate = toLocalIsoDate(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const hasStarted = ({ date, startTime }) => date < nowDate || (date === nowDate && startTime <= nowTime);

  const targetSlots = mockSlots.filter((slot) => slot.date >= targetFrom && slot.date <= targetTo);
  const replaced = targetSlots.filter((slot) => !hasStarted(slot));
  if (replaced.some((slot) => bookedSlotIds.has(slot.id))) {
    const error = new Error('The target week has bookings: its schedule cannot be replaced');
    error.status = 409;
    throw error;
  }
  const sourceSlots = mockSlots
    .filter((slot) => slot.date >= sourceFrom && slot.date <= sourceTo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  for (const slot of replaced) mockSlots.splice(mockSlots.indexOf(slot), 1);
  const kept = targetSlots.filter(hasStarted);

  const created = [];
  const skipped = [];
  for (const slot of sourceSlots) {
    const date = toLocalIsoDate(addDays(toLocalDate(slot.date), shift));
    const { startTime, endTime, label } = slot;
    if (hasStarted({ date, startTime })) {
      skipped.push({ date, startTime, endTime, label, reason: 'past' });
    } else if (kept.some((existing) =>
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
        menu: null, // menus are not copied (openapi: copy week)
        tables: slot.tables.map((table, index) => ({ id: tableId + index + 1, name: table.name, seats: table.seats })),
      };
      mockSlots.push(copy);
      created.push(copy);
    }
  }
  return { created, replaced, skipped };
}

// Mock of PUT /api/slots/{id}/menu: same rules as the server (trimmed; empty or null clears it, at most 2000;
// 409 for a slot that has started: PO, issue #59, its menu stays fixed).
export async function setSlotMenu(id, menu) {
  if (menu !== null && typeof menu !== 'string') {
    const error = new Error('menu must be a text or null');
    error.status = 400;
    throw error;
  }
  const slot = mockSlots.find((existing) => existing.id === id);
  if (!slot) {
    const error = new Error('Slot not found');
    error.status = 404;
    throw error;
  }
  const text = menu === null ? '' : menu.trim();
  if (text.length > 2000) {
    const error = new Error('The menu cannot exceed 2000 characters');
    error.status = 400;
    throw error;
  }
  // PO (MH-10, issue #59): a menu can be set, changed or removed only before its slot starts.
  if (slot.past) {
    const error = new Error('The menu of a slot that has started cannot be changed');
    error.status = 409;
    throw error;
  }
  slot.menu = text || null;
  return { ...slot };
}

// Mock of GET /api/slots/menus: each text once with its most recent slot, most recent first, at most 20.
export async function listPreviousMenus(q = '') {
  const text = q.trim().toLowerCase();
  const seen = new Set();
  return [...mockSlots]
    .filter((slot) => slot.menu && slot.menu.toLowerCase().includes(text))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime) || b.id - a.id)
    .filter((slot) => !seen.has(slot.menu) && seen.add(slot.menu))
    .slice(0, 20)
    .map(({ menu, id, date, startTime, label }) => ({ menu, slotId: id, date, startTime, label }));
}
