// MH-07 – recovery of a forgotten password by email (PO #36), link valid 24 h (PO #44), usable once.
// The token is 32 random bytes sent only in the email; the database keeps its SHA-256, so a copy of the
// database gives no working link. The request answers the same whether the email exists or not
// (the route always says 202), so nobody can find out who has an account.
import { createHash, randomBytes } from 'node:crypto';
import { now } from '../clock.js';
import { config } from '../config.js';
import { getDb } from '../dao/db.js';
import * as passwordResetDao from '../dao/passwordResetDao.js';
import { withTransaction } from '../dao/transaction.js';
import * as userDao from '../dao/userDao.js';
import { BadRequest } from '../errors.js';
import { sendMail } from '../notifications/mailer.js';
import { passwordResetEmail } from '../notifications/templates/passwordReset.js';
import { endSessionsOf } from '../session.js';
import { MESSAGES as AUTH_MESSAGES, MIN_PASSWORD_LENGTH, hashPassword } from './authService.js';

export const RESET_LINK_HOURS = 24;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MESSAGES = {
  invalidEmail: 'Enter a valid email',
  resetRequired: 'The link and a new password are required',
  badLink: 'This link is not valid or has expired: ask for a new one',
  shortPassword: AUTH_MESSAGES.shortPassword,
};

const sha256 = (token) => createHash('sha256').update(token).digest('hex');

/** The client page of the link: the app's own address in production (D1), the Vite one in development. */
function resetLink(token) {
  return `${config.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Sends a reset link to `email` when it belongs to a user with a password. Always resolves the same way.
 * If the email cannot be sent, the error is logged and the answer stays the same (nothing to reveal).
 */
export async function requestPasswordReset(body) {
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!EMAIL_RE.test(email)) throw new BadRequest(MESSAGES.invalidEmail);

  const db = await getDb();
  const found = await userDao.findCredentialsByEmail(db, email);
  if (!found?.passwordHash) return; // unknown email, or a temporary hiker: same answer, no email

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now().getTime() + RESET_LINK_HOURS * 3600 * 1000).toISOString();
  await passwordResetDao.replaceForUser(db, { tokenHash: sha256(token), userId: found.id, expiresAt });
  try {
    const { subject, text } = passwordResetEmail(found, resetLink(token), RESET_LINK_HOURS);
    await sendMail({ to: found.email, subject, text });
  } catch (err) {
    console.error(`Password reset email for user ${found.id} not sent:`, err);
  }
}

/**
 * Checks whether `token` is still valid (not used, not expired), without consuming it: the Reset-password
 * page calls this on load, before showing the form, so a dead link is caught right away (PO #36, #44)
 * instead of after the hiker has typed a new password twice.
 * @throws {BadRequest} missing token, or a link that is unknown, used or expired
 */
export async function checkPasswordResetToken(token) {
  if (typeof token !== 'string' || token === '') throw new BadRequest(MESSAGES.badLink);
  const db = await getDb();
  const id = await passwordResetDao.findValid(db, sha256(token), now().toISOString());
  if (!id) throw new BadRequest(MESSAGES.badLink);
}

/**
 * Sets the new password of the link's user, once: the link is marked used in the same transaction, so two
 * requests with the same link cannot both succeed. Afterwards every session of that user is logged out.
 * @throws {BadRequest} missing fields, short password, or a link that is unknown, used or expired
 */
export async function confirmPasswordReset(body) {
  const { token, newPassword } = body ?? {};
  if (typeof token !== 'string' || token === '' || typeof newPassword !== 'string' || newPassword === '') {
    throw new BadRequest(MESSAGES.resetRequired);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new BadRequest(MESSAGES.shortPassword);

  const passwordHash = await hashPassword(newPassword); // outside the transaction: scrypt takes time
  const db = await getDb();
  const tokenHash = sha256(token);
  const userId = await withTransaction(db, async () => {
    const nowIso = now().toISOString();
    const id = await passwordResetDao.findValid(db, tokenHash, nowIso);
    if (!id || !(await passwordResetDao.markUsed(db, tokenHash, nowIso))) throw new BadRequest(MESSAGES.badLink);
    await userDao.setPassword(db, id, passwordHash);
    return id;
  });
  await endSessionsOf(userId);
}
