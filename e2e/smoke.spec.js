// Sample E2E test from U1 Repository setup: proves that server, client, proxy and axe work together.
// Story E2E tests go in their own file: checkAvailability.spec.js, booking.spec.js, slots.spec.js.
import { expect, test } from '@playwright/test';
import { expectAccessible } from './helpers/axe.js';

test('the home page opens and is accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Mountain Hut' })).toBeVisible();
  await expectAccessible(page);
});

test('the client reaches the server through the proxy', async ({ request }) => {
  const res = await request.get('/api/nothing-here');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'No API endpoint for GET /api/nothing-here' });
});

test('the page has no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
