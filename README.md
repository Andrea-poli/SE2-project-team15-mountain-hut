# Mountain Hut – Team 15

Web application that supports the activities of a mountain hut: hikers check availability and book a table, the hut staff define the time slots and their tables.
Software Engineering II project, Politecnico di Torino, A.Y. 2026/27. Requirements: [SE2-Polito/AY26-27-Mountain-Hut](https://github.com/SE2-Polito/AY26-27-Mountain-Hut).

## Team

Andrea Romano · Federico Angeloni · Alessandro Vallillo · Mohammad Mahdi Faraji · Yaël Vincent

## Stack

| Part | Technologies |
|---|---|
| Server (`server/`) | Node.js 22, Express 5, SQLite (`sqlite3`), express-session, Nodemailer |
| Client (`client/`) | React 19, Vite, React Router, React-Bootstrap |
| Tests | Vitest + Supertest (server), Vitest + React Testing Library (client), Playwright + axe (E2E) |
| Quality | ESLint, coverage with Vitest (v8) |

Monorepo with npm workspaces: one `npm install` at the root installs everything.

## Getting started

Requirements: Node.js 22.9 or later (22 or 24 LTS recommended).

```bash
npm install                      # server + client + tools
npx playwright install chromium  # only once per computer, for the E2E tests
cp .env.example .env             # then set your own SESSION_SECRET in .env (command in the file)
npm run seed                     # demo users, slots and bookings (see Demo accounts)
npm run dev                      # server on http://localhost:3001, client on http://localhost:5173
```

The server does not start without `SESSION_SECRET`: no secret is written in the code. `.env` is personal and never committed.

Open http://localhost:5173. In development the client calls `/api/...` on its own address and Vite forwards the call to the server (same origin: the session cookie works, no CORS).

## Demo accounts

`npm run seed` fills the development database with demo data: slots from 7 days ago to 14 days ahead (lunch, dinner, and a second dinner turn on Saturdays, tables T1–T5) and a few bookings. Dates are relative to today, so the data never gets old: run it again whenever you want a fresh start. It **replaces** every user, slot and booking and logs everybody out; it refuses to run when `NODE_ENV=production`. Tests never use it.

| Role | Email | Password |
|---|---|---|
| Hiker | `hiker@example.com` | `hikerpass` |
| Employee | `employee@example.com` | `employeepass` |
| Warden | `warden@example.com` | `wardenpass` |

Other hikers with bookings: `marco.rossi@example.com`, `anna.bianchi@example.com`, `luca.verdi@example.com` (password `hikerpass`). The same accounts work in mock mode (`VITE_USE_MOCKS=true`). Passwords are stored hashed (salt + scrypt): plain demo passwords are written only here.

## Scripts (from the root)

| Command | What it does |
|---|---|
| `npm run dev` | starts server (auto-restart on save) and client together |
| `npm test` | unit and integration tests of server and client |
| `npm run coverage` | the same tests with the coverage report (`server/coverage/`, `client/coverage/`) |
| `npm run lint` | ESLint on the whole repository |
| `npm run seed` | replaces the development data with the demo data (see Demo accounts) |
| `npm run test:e2e` | Playwright E2E tests: starts its own server (port 3101) and client (port 5174) |

Single workspace: `npm test -w server`, `npm run dev -w client`, …

## Settings

Read from `.env` in the repository root (template: `.env.example`). Variables already set in the shell, by Playwright or by Docker win over the file. The Vite proxy reads the same `.env`, so it follows `PORT`.

| Variable | Default | Use |
|---|---|---|
| `SESSION_SECRET` | – (required) | session cookie secret, your own random value |
| `PORT` | `3001` | server port |
| `TZ` | `Europe/Rome` | hut local time (set by the server if missing) |
| `DATA_DIR` | `server/data` | folder of `mountain-hut.db` and `sessions.db`; relative paths start from the repository root |
| `FAKE_NOW` | – | fixed "now" in hut local time, `YYYY-MM-DDTHH:mm`, for demos only; refused in production, a warning is printed when active |

## Tests

- Tests never touch the development database: a Vitest setup file (`server/test/setupTestDb.js`) gives every server test file its own temporary DB before any import, and deletes it at the end. Nothing to call in the tests.
- Server tests can fix the clock with `useFixedClock()` (`server/test/helpers/fixedClock.js`). In `server/src` only `clock.js` may read the real time: ESLint refuses `new Date()` and `Date.now()` elsewhere, use `now()`.
- E2E tests run with their own DB (`e2e/.tmp/`), a dummy secret and a fixed day and time (`E2E_NOW`) for both the server and the browser, on a desktop window and on a 360 px phone. Story E2E tests import `test` and `expect` from `e2e/helpers/clock.js`.
- Every E2E test calls `expectAccessible(page)` (`e2e/helpers/axe.js`: serious or critical axe violations fail, minor ones are printed) and `expectNoHorizontalScroll(page)` (`e2e/helpers/layout.js`).
- Manual checks, and the minor axe violations, are recorded in `docs/manual-tests.md`.

## Project structure

```
server/src/
  index.js            starts the server (reads config.js first)
  config.js           settings from env variables, checked at startup (SESSION_SECRET, FAKE_NOW)
  app.js              ★ mounts every route of the sprint – stories fill their own route file
  clock.js            now(): the only source of the current time (FAKE_NOW / setNow in tests)
  errors.js           BadRequest, Unauthorized, Forbidden, NotFound, Conflict → { error }
  routes/             one file per area: auth, publicSlots, bookings, slots, availability, testSupport
  middleware/         errorHandler, notFound
  notifications/      notifier.js: bookingConfirmed() hook (called by MH-01, filled by MH-03)
  seed.js             demo data (npm run seed), dates relative to today
server/test/          setupTestDb.js (temporary DB per file), helpers/, unit/, integration/
client/src/           React app (App.jsx is a placeholder until U7 Common UI)
client/test/          unit tests (React Testing Library)
e2e/                  Playwright tests, one spec per story; helpers/ clock.js, axe.js, layout.js
docs/                 manual tests
```
