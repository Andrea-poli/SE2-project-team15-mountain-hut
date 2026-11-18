// MH-07 – text of the password reset email (PO #36: "the hiker can recover their password via email").
// Pure function: no I/O, easy to test.

const SUBJECT = 'Reset your password – Mountain Hut';

/**
 * @param {{ firstName: string }} user
 * @param {string} link the client page with the token, e.g. https://hut.example/reset-password?token=…
 * @param {number} hours how long the link works (24, PO #44)
 * @returns {{ subject: string, text: string }}
 */
export function passwordResetEmail(user, link, hours) {
  const text = [
    `Hello ${user.firstName},`,
    '',
    'Someone asked to reset the password of your Mountain Hut account.',
    `To choose a new password, open this link within ${hours} hours (it works once):`,
    '',
    link,
    '',
    'If you did not ask for it, ignore this email: your password stays the same.',
    '',
    'The Mountain Hut',
  ].join('\n');
  return { subject: SUBJECT, text };
}
