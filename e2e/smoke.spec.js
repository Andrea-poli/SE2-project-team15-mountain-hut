// Sample E2E test from U1 Repository setup: proves that server, client, proxy, fixed clock and axe work together.
// Story E2E tests go in their own file (checkAvailability.spec.js, booking.spec.js, slots.spec.js)
// and use the same helpers.
import { expectAccessible } from './helpers/axe.js';
import { E2E_NOW, expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

test('the home page opens, is accessible and has no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Mountain Hut' })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('the browser clock is frozen on the same day and time as the server', async ({ page }) => {
  await page.goto('/');
  const browserNow = await page.evaluate(() => new Date().toISOString());
  expect(browserNow).toBe(new Date(E2E_NOW).toISOString());
});

test('the client reaches the server through the proxy', async ({ request }) => {
  const res = await request.get('/api/nothing-here');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'No API endpoint for GET /api/nothing-here' });
});
