// /api/auth – register, login, password change, logout, me (openapi.yaml tag auth).
// The session keeps only the user id; req.user is loaded by loadUser (middleware/auth.js).
import { Router } from 'express';
import { requireLogin } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import { SESSION_COOKIE, logIn, logOut } from '../session.js';

const router = Router();

// POST /api/auth/register → 201 User (already logged in) | 400 | 409 "Email already in use"
router.post('/register', async (req, res) => {
  const user = await authService.register(req.body);
  await logIn(req, user);
  res.status(201).json(user);
});

// POST /api/auth/login → 200 User | 400 "Email and password are required" | 401 "Invalid email or password"
router.post('/login', async (req, res) => {
  const user = await authService.login(req.body);
  await logIn(req, user);
  res.json(user);
});

// PUT /api/auth/password → 200 updated User | 400 invalid new password | 401 wrong current password
router.put('/password', requireLogin, async (req, res) => {
  res.json(await authService.changePassword(req.user, req.body));
});

// POST /api/auth/password-reset {email} → 202 always (an unknown email gets the same answer) | 400 invalid email
router.post('/password-reset', async (req, res) => {
  await passwordResetService.requestPasswordReset(req.body);
  res.status(202).end();
});

// GET /api/auth/password-reset/validity?token=… → 200 valid | 400 missing/bad/used/expired link. Never
// consumes the token: the Reset-password page checks it on load, before showing the form (MH-07).
router.get('/password-reset/validity', async (req, res) => {
  await passwordResetService.checkPasswordResetToken(req.query.token);
  res.status(200).end();
});

// POST /api/auth/password-reset/confirm {token, newPassword} → 204 | 400 missing, short, or bad/used/expired link
router.post('/password-reset/confirm', async (req, res) => {
  await passwordResetService.confirmPasswordReset(req.body);
  res.status(204).end();
});

// POST /api/auth/logout → 204, also with no active session (idempotent)
router.post('/logout', async (req, res) => {
  await logOut(req);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

// GET /api/auth/me → 200 User | 401 "Not logged in"
router.get('/me', requireLogin, (req, res) => {
  res.json(req.user);
});

export default router;
