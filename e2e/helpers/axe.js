// Accessibility check used by every E2E test (planning DoD):
// serious or critical axe violations fail the test; minor and moderate ones do not,
// but they are printed and attached to the report, so they can be recorded in docs/manual-tests.md.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const describe = (v) => `${v.impact}: ${v.id} – ${v.help} (${v.nodes.length} element(s)) ${v.helpUrl}`;

export async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const isBlocking = (v) => v.impact === 'serious' || v.impact === 'critical';

  const minor = results.violations.filter((v) => !isBlocking(v)).map(describe);
  if (minor.length > 0) {
    console.warn(`[axe] ${page.url()} – minor violations to record in docs/manual-tests.md:\n  ${minor.join('\n  ')}`);
    await test.info().attach('axe minor violations', { body: minor.join('\n'), contentType: 'text/plain' });
  }

  const blocking = results.violations.filter(isBlocking).map(describe);
  expect(blocking, 'serious or critical accessibility violations').toEqual([]);
}
