// MH-11 BT1 – unit tests of services/mealService.js (listMeals) with a fixed clock and the temporary DB of
// setupTestDb.js. The range checks of the query are in dateRange.js (unit tests in test/unit/dateRange.test.js)
// and the HTTP side in test/integration/mealsApi.test.js.
import { beforeEach, describe, expect, it } from 'vitest';
import { setNow } from '../../../src/clock.js';
import { getDb } from '../../../src/dao/db.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import { listMeals } from '../../../src/services/mealService.js';
import { clearDb, createSlot } from '../../helpers/bookingApi.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut.
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
useFixedClock(`${TODAY}T10:00`);

beforeEach(async () => {
  await clearDb();
});

describe('listMeals', () => {
  it('maps each open slot of the range to a Meal: times, label, past and menu, no tables or status', async () => {
    const lunch = await createSlot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Lunch' });
    await slotDao.setMenu(await getDb(), lunch.id, 'Polenta');
    const dinner = await createSlot({ date: TOMORROW, label: 'Dinner' });

    await expect(listMeals(TODAY, TOMORROW)).resolves.toEqual([
      {
        id: lunch.id,
        date: TOMORROW,
        startTime: '12:00',
        endTime: '14:00',
        label: 'Lunch',
        past: false,
        menu: 'Polenta',
      },
      { id: dinner.id, date: TOMORROW, startTime: '19:00', endTime: '20:30', label: 'Dinner', past: false, menu: null },
    ]);
  });

  it('leaves out the closed slots and the slots outside the range', async () => {
    await createSlot({ date: TOMORROW, label: 'Closed', status: 'closed' });
    await createSlot({ date: '2026-11-05', label: 'Outside' });
    const open = await createSlot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Open' });

    await expect(listMeals(TODAY, '2026-11-04')).resolves.toEqual([expect.objectContaining({ id: open.id })]);
  });

  it('computes past from the clock: the same slot becomes past when its start time arrives', async () => {
    await createSlot({ date: TODAY, startTime: '12:00', endTime: '14:00', label: 'Lunch' });

    await expect(listMeals(TODAY, TODAY)).resolves.toEqual([expect.objectContaining({ past: false })]);
    setNow(`${TODAY}T12:00`);
    await expect(listMeals(TODAY, TODAY)).resolves.toEqual([expect.objectContaining({ past: true })]);
  });

  it('gives an empty list when the range has no open slots', async () => {
    await expect(listMeals('2026-12-01', '2026-12-31')).resolves.toEqual([]);
  });
});
