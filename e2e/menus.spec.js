// MH-10 – Define menus (staff week view: "Add menu", "View menu", the menu editor), at desktop and 360 px.
// From the story, the PO rule (a menu can be added, changed or removed only before its slot starts; after, it can
// only be viewed; a menu reused on more slots is changed only on its own slot) and docs/openapi.yaml ("Menus",
// PUT /api/slots/{id}/menu, GET /api/slots/menus). Same behaviour as the unit tests of MenuEditorDialog,
// PreviousMenus, MenuViewDialog, SlotCard and SlotsWeekMenus.
//   E1 The employee adds a menu to a future slot with the toolbar (Bold on a word, List item on two lines, Sub-item
//      under the first), checks the preview and saves: "Menu saved: …", the closed card says "Menu set", and
//      "View menu" shows it formatted (bold text, a list with a sub-item).
//   E2 A previous menu is reused on another future slot ("Reuse a previous menu", search, "Use this menu"), one line
//      is changed and saved: the new slot has the changed menu, the first slot still has its own.
//   E3 A menu with <script> and <b> is saved and shown as plain text: no script runs, no bold "x".
//   E4 A menu is removed ("Remove menu", then "Yes, remove"): the card says "No menu" again.
//   E5 On a slot that has started, "Add menu" is shown but unavailable (aria-disabled, with the reason in its
//      description and in a tooltip) and opens no editor.
//
// Data: the demo seed on E2E_NOW (Mon 2 Nov 2026, 10:00): every day has "Lunch" 12:00–14:00 and
// "Dinner – 1st turn" 19:00–20:30, from 7 days ago to 14 days ahead, and no menus; employee@example.com /
// employeepass. The desktop and phone runs share one database, so each uses its own future slots in the week of
// 9 Nov (no bookings): desktop Mon 9 – Wed 11, phone Thu 12 – Sat 14. E2 and E4 first write the menu they need
// with PUT /api/slots/{id}/menu on a future slot. E5 uses Sun 1 Nov (a past day, read only): no seeded slot of
// today has started at 10:00.
import { expectAccessible } from './helpers/axe.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const LUNCH = { label: 'Lunch', start: '12:00', time: '12:00 – 14:00' };
const DINNER = { label: 'Dinner – 1st turn', start: '19:00', time: '19:00 – 20:30' };
const slotOn = (date, day, kind) => ({ date, day, ...kind });

const WEEK = '2026-11-09';
const DATA_BY_PROJECT = {
  desktop: {
    e1: slotOn('2026-11-09', 'Mon 9 Nov', LUNCH),
    reuseSource: slotOn('2026-11-09', 'Mon 9 Nov', DINNER),
    reuseTarget: slotOn('2026-11-10', 'Tue 10 Nov', LUNCH),
    e3: slotOn('2026-11-10', 'Tue 10 Nov', DINNER),
    e4: slotOn('2026-11-11', 'Wed 11 Nov', LUNCH),
    reuseMenu: 'Barley soup\n- **Venison stew** with polenta\n- Apple strudel',
    reuseSearch: 'barley',
  },
  phone: {
    e1: slotOn('2026-11-12', 'Thu 12 Nov', LUNCH),
    reuseSource: slotOn('2026-11-12', 'Thu 12 Nov', DINNER),
    reuseTarget: slotOn('2026-11-13', 'Fri 13 Nov', LUNCH),
    e3: slotOn('2026-11-13', 'Fri 13 Nov', DINNER),
    e4: slotOn('2026-11-14', 'Sat 14 Nov', LUNCH),
    reuseMenu: 'Pumpkin soup\n- **Canederli** in broth\n- Apple strudel',
    reuseSearch: 'pumpkin',
  },
};
// A past day (read only, the same for both runs): the previous week's Sunday.
const PAST_WEEK = '2026-10-26';
const STARTED = slotOn('2026-11-01', 'Sun 1 Nov', LUNCH);

const data = () => DATA_BY_PROJECT[test.info().project.name];
const slotName = (slot) => `${slot.label}, ${slot.day}, ${slot.time}`;

async function logIn(page) {
  await page.goto(`/login?next=${encodeURIComponent('/staff/slots')}`);
  await page.getByLabel('Email', { exact: true }).fill('employee@example.com');
  await page.getByLabel('Password', { exact: true }).fill('employeepass');
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Slots of the week' })).toBeVisible();
}

async function openWeek(page, monday) {
  await page.goto(`/staff/slots?week=${monday}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Slots of the week' })).toBeVisible();
}

const dayOf = (page, slot) => page.getByRole('region').filter({ has: page.getByRole('heading', { name: slot.day }) });
const cardOf = (page, slot) => dayOf(page, slot).getByRole('button', { name: new RegExp(slot.label) });

async function openCard(page, slot) {
  const card = cardOf(page, slot);
  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
}

async function closeCard(page, slot) {
  const card = cardOf(page, slot);
  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'false');
}

const editor = (page) => page.getByRole('dialog', { name: /^(Add|Edit) menu/ });
const viewer = (page) => page.getByRole('dialog', { name: /^Menu/ });
const menuField = (page) => editor(page).getByRole('textbox', { name: 'Menu', exact: true });
const preview = (page) => editor(page).getByRole('region', { name: 'Preview' });

/** Selects from `start` to `end` in the menu field, as a mouse drag would. */
async function select(page, start, end) {
  await menuField(page).evaluate((field, [from, to]) => {
    field.focus();
    field.setSelectionRange(from, to);
  }, [start, end]);
}

/** The slot as the server keeps it (GET /api/slots with the employee's session). */
async function slotFromServer(page, slot) {
  const res = await page.request.get(`/api/slots?from=${slot.date}&to=${slot.date}`);
  expect(res.ok(), await res.text()).toBe(true);
  const found = (await res.json()).find((s) => s.label === slot.label && s.startTime === slot.start);
  expect(found, `${slot.label} on ${slot.date}`).toBeTruthy();
  return found;
}

/** Writes a menu before the test (PUT /api/slots/{id}/menu), on a slot that has not started. */
async function setMenu(page, slot, menu) {
  const { id } = await slotFromServer(page, slot);
  const res = await page.request.put(`/api/slots/${id}/menu`, { data: { menu } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Checks the menu shown in an open "View menu" dialog against the given lines of text. */
async function expectMenuShown(page, texts) {
  for (const text of texts) await expect(viewer(page).getByText(text, { exact: true })).toBeVisible();
}

test.describe('Define menus (staff)', () => {
  test.beforeEach(async ({ page }) => logIn(page));

  test('E1: a menu written with the toolbar is saved, and "View menu" shows it formatted', async ({ page }) => {
    const slot = data().e1;
    await openWeek(page, WEEK);
    await expect(cardOf(page, slot)).toContainText('No menu');
    await openCard(page, slot);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await dayOf(page, slot).getByRole('button', { name: 'Add menu' }).click();
    await expect(editor(page)).toBeVisible();
    await expect(editor(page).getByRole('heading', { level: 2 })).toContainText(slotName(slot));

    // Bold on a word, List item on the two lines, then a new line under the first one made a Sub-item.
    await menuField(page).fill('Polenta with mushrooms\nApple strudel');
    await select(page, 0, 'Polenta'.length);
    await editor(page).getByRole('button', { name: 'Bold' }).click();
    await expect(menuField(page)).toHaveValue('**Polenta** with mushrooms\nApple strudel');
    await select(page, 0, (await menuField(page).inputValue()).length);
    await editor(page).getByRole('button', { name: 'List item' }).click();
    await expect(menuField(page)).toHaveValue('- **Polenta** with mushrooms\n- Apple strudel');
    const endOfFirstLine = (await menuField(page).inputValue()).indexOf('\n');
    await select(page, endOfFirstLine, endOfFirstLine);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Vegetarian on request');
    await editor(page).getByRole('button', { name: 'Sub-item' }).click();
    const menu = '- **Polenta** with mushrooms\n  - Vegetarian on request\n- Apple strudel';
    await expect(menuField(page)).toHaveValue(menu);

    // The preview: "Polenta" bold, two items, the sub-item inside the first.
    await expect(preview(page).getByText('Polenta', { exact: true })).toHaveJSProperty('tagName', 'STRONG');
    const polenta = preview(page).getByRole('listitem').filter({ hasText: 'Polenta' });
    await expect(polenta.getByRole('listitem')).toHaveText('Vegetarian on request');
    await expect(preview(page).getByText('Apple strudel', { exact: true })).toBeVisible();
    await expect(preview(page)).not.toContainText('*');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await editor(page).getByRole('button', { name: 'Save menu' }).click();

    await expect(editor(page)).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: `Menu saved: ${slotName(slot)}` })).toBeVisible();
    expect((await slotFromServer(page, slot)).menu).toBe(menu);
    await closeCard(page, slot);
    await expect(cardOf(page, slot)).toContainText('Menu set');

    await openCard(page, slot);
    await dayOf(page, slot).getByRole('button', { name: 'View menu' }).click();
    await expect(viewer(page).getByRole('heading', { level: 2 })).toContainText(slotName(slot));
    await expect(viewer(page).getByText('Polenta', { exact: true })).toHaveJSProperty('tagName', 'STRONG');
    const shownPolenta = viewer(page).getByRole('listitem').filter({ hasText: 'Polenta' });
    await expect(shownPolenta.getByRole('listitem')).toHaveText('Vegetarian on request');
    await expectMenuShown(page, ['Apple strudel']);
    await expect(viewer(page)).not.toContainText('*');
    await expect(viewer(page).getByRole('button', { name: 'Edit menu' })).not.toHaveAttribute('aria-disabled', 'true');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('E2: a previous menu is reused and changed on another slot; the first slot keeps its own menu', async ({
    page,
  }) => {
    const { reuseSource: source, reuseTarget: target, reuseMenu, reuseSearch } = data();
    await setMenu(page, source, reuseMenu);
    await openWeek(page, WEEK);
    await openCard(page, target);
    await dayOf(page, target).getByRole('button', { name: 'Add menu' }).click();

    // The toggle is "Reuse a previous menu" when closed, "Hide previous menus" when open.
    const reuse = editor(page).getByRole('button', { name: /previous menu/ });
    await expect(reuse).toHaveText('Reuse a previous menu');
    await reuse.click();
    await expect(reuse).toHaveAttribute('aria-expanded', 'true');
    await editor(page).getByLabel('Search previous menus').fill(reuseSearch);
    const useSource = editor(page).getByRole('button', {
      name: `Use this menu: ${source.label}, ${source.day} ${source.start}`,
    });
    await expect(useSource).toBeVisible();
    await expect(editor(page).getByRole('button', { name: /^Use this menu: / })).toHaveCount(1);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await useSource.click();

    await expect(menuField(page)).toHaveValue(reuseMenu);
    await expect(editor(page).getByText(`Menu of ${source.label}, ${source.day} copied`)).toBeVisible();
    const changed = reuseMenu.replace('- Apple strudel', '- Blueberry tart');
    await menuField(page).fill(changed);
    await editor(page).getByRole('button', { name: 'Save menu' }).click();

    await expect(editor(page)).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: `Menu saved: ${slotName(target)}` })).toBeVisible();
    expect((await slotFromServer(page, target)).menu).toBe(changed);
    expect((await slotFromServer(page, source)).menu).toBe(reuseMenu);

    // On screen too: the new slot has the changed line, the first slot its own.
    await dayOf(page, target).getByRole('button', { name: 'View menu' }).click();
    await expectMenuShown(page, ['Blueberry tart']);
    await expect(viewer(page)).not.toContainText('Apple strudel');
    await viewer(page).getByRole('button', { name: 'Close' }).first().click();
    await expect(viewer(page)).toBeHidden();
    await openCard(page, source);
    await dayOf(page, source).getByRole('button', { name: 'View menu' }).click();
    await expectMenuShown(page, ['Apple strudel']);
    await expect(viewer(page)).not.toContainText('Blueberry tart');
  });

  test('E3: HTML in a menu is saved and shown as plain text', async ({ page }) => {
    const slot = data().e3;
    const browserDialogs = [];
    page.on('dialog', async (dialog) => {
      browserDialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await openWeek(page, WEEK);
    await openCard(page, slot);
    await dayOf(page, slot).getByRole('button', { name: 'Add menu' }).click();

    const menu = '<script>alert(1)</script>\n<b>x</b>';
    await menuField(page).fill(menu);
    // Both lines are one paragraph (with a line break): checked as text of the preview.
    await expect(preview(page)).toContainText('<script>alert(1)</script>');
    await expect(preview(page)).toContainText('<b>x</b>');
    await editor(page).getByRole('button', { name: 'Save menu' }).click();
    await expect(editor(page)).toBeHidden();
    expect((await slotFromServer(page, slot)).menu).toBe(menu);

    await dayOf(page, slot).getByRole('button', { name: 'View menu' }).click();

    await expect(viewer(page)).toContainText('<script>alert(1)</script>');
    await expect(viewer(page)).toContainText('<b>x</b>');
    await expect(viewer(page).getByText('x', { exact: true })).toHaveCount(0); // no "x" on its own, in bold
    expect(browserDialogs).toEqual([]); // the script never ran
  });

  test('E4: a menu is removed after "Yes, remove", and the card says "No menu" again', async ({ page }) => {
    const slot = data().e4;
    await setMenu(page, slot, 'Mushroom soup\n- Apple strudel');
    await openWeek(page, WEEK);
    await expect(cardOf(page, slot)).toContainText('Menu set');
    await openCard(page, slot);
    await dayOf(page, slot).getByRole('button', { name: 'View menu' }).click();
    await viewer(page).getByRole('button', { name: 'Edit menu' }).click();
    await expect(editor(page).getByRole('heading', { level: 2 })).toContainText('Edit menu');

    await editor(page).getByRole('button', { name: 'Remove menu' }).click();
    await expect(editor(page).getByText('Remove the menu of this slot?')).toBeVisible();
    await expect(editor(page).getByRole('button', { name: 'Keep it' })).toBeFocused();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
    await editor(page).getByRole('button', { name: 'Yes, remove' }).click();

    await expect(editor(page)).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: `Menu removed: ${slotName(slot)}` })).toBeVisible();
    expect((await slotFromServer(page, slot)).menu).toBeNull();
    await expect(dayOf(page, slot).getByRole('button', { name: 'Add menu' })).toBeVisible();
    await closeCard(page, slot);
    await expect(cardOf(page, slot)).toContainText('No menu');
  });

  test('E5: on a slot that has started, "Add menu" is unavailable with its reason and opens no editor', async ({
    page,
  }) => {
    const reason = 'This slot has started: a menu can no longer be added.';
    await openWeek(page, PAST_WEEK);
    await expect(cardOf(page, STARTED)).toContainText('Past');
    await expect(cardOf(page, STARTED)).toContainText('No menu');
    await openCard(page, STARTED);

    const add = dayOf(page, STARTED).getByRole('button', { name: 'Add menu' });
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await expect(add).toHaveAccessibleDescription(reason);
    await add.hover();
    await expect(page.getByRole('tooltip')).toHaveText(reason);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // Neither a click nor the keyboard opens the editor (force: Playwright waits for aria-disabled buttons).
    await add.click({ force: true });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await slotFromServer(page, STARTED)).menu).toBeNull();
  });
});
