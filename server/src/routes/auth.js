// /api/auth – register, login, logout, me (U5, openapi.yaml tag auth).
// The session keeps only the user id; req.user is loaded by loadUser (middleware/auth.js).
import { Router } from 'express';
import { requireLogin } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
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
