// Accessibility check used by every E2E test (planning DoD):
// no serious or critical axe violations; minor ones go to docs/manual-tests.md.
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

export async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact}: ${v.id} – ${v.help} (${v.nodes.length} element(s))`);
  expect(blocking, 'serious or critical accessibility violations').toEqual([]);
}
