// U9 – Log in and Register pages (MH-01, MH-02 frontend), at desktop and 360 px (playwright.config.js projects).
// The server of this branch has no auth routes yet (U5 is on common/base-backend): these tests cover what
// works without it — empty submit, focus, accessibility, layout. The full login (register → log out →
// log in) is added here when U5 is merged.
import { expectAccessible } from './helpers/axe.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const PAGES = [
  {
    path: '/login',
    heading: 'Log in',
    submit: 'Log in',
    errors: [
      ['Email', 'Enter your email.'],
      ['Password', 'Enter your password.'],
    ],
  },
  {
    path: '/register',
    heading: 'Register',
    submit: 'Create account',
    errors: [
      ['First name', 'Enter your first name.'],
      ['Last name', 'Enter your last name.'],
      ['Email', 'Enter your email.'],
      ['Password', 'Enter a password.'],
      ['Confirm password', 'Confirm your password.'],
      ['Mobile number', 'Enter your mobile number.'],
    ],
  },
];

for (const { path, heading, submit, errors } of PAGES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });

    test('is accessible and has no horizontal scroll', async ({ page }) => {
      await expect(page).toHaveTitle(`${heading} – Mountain Hut`);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    });

    test('an empty submit flags every required field and focuses the first one', async ({ page }) => {
      await page.getByRole('main').getByRole('button', { name: submit, exact: true }).click();

      const [firstLabel] = errors[0];
      await expect(page.getByLabel(firstLabel, { exact: true })).toBeFocused();
      for (const [label, message] of errors) {
        const field = page.getByLabel(label, { exact: true });
        await expect(field, label).toHaveAttribute('aria-invalid', 'true');
        // The error comes first in the description (FormField / PasswordField), then the help text.
        await expect(field, label).toHaveAccessibleDescription(new RegExp(`^${message.replace('.', '\\.')}`));
      }

      // The page with all its errors: still accessible and no wider than the screen.
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    });
  });
}
