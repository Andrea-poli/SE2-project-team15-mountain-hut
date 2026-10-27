// Responsive check used by every story E2E (planning 4.6): no horizontal scroll, also on a 360 px phone.
import { expect } from '@playwright/test';

export async function expectNoHorizontalScroll(page) {
  // clientWidth excludes the vertical scrollbar (window.innerWidth includes it).
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'page wider than the screen').toBeLessThanOrEqual(clientWidth);
}
