// The day and time the E2E tests "live in", in hut local time.
// The server reads it as FAKE_NOW (playwright.config.js); the browser clock is frozen on it by the
// fixture below, so page and server always agree on "today", whatever day the tests run.
//
// Story E2E tests import test and expect from this file instead of '@playwright/test':
//   import { expect, test } from './helpers/clock.js';
import { test as base } from '@playwright/test';

export const E2E_NOW = '2026-11-02T10:00';

export const test = base.extend({
  page: async ({ page }, use) => {
    // setFixedTime (not setSystemTime): the server clock does not move either.
    await page.clock.setFixedTime(E2E_NOW);
    await use(page);
  },
});

export { expect } from '@playwright/test';
