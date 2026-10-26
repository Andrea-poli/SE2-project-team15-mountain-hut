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

```bash
npm install                      # server + client + tools
npx playwright install chromium  # only once per computer, for the E2E tests
npm run dev                      # server on http://localhost:3001, client on http://localhost:5173
```

Open http://localhost:5173. In development the client calls `/api/...` on its own address and Vite forwards the call to the server (same origin: the session cookie works, no CORS).

## Scripts (from the root)

| Command | What it does |
|---|---|
| `npm run dev` | starts server (auto-restart on save) and client together |
| `npm test` | unit and integration tests of server and client |
| `npm run coverage` | the same tests with the coverage report (`server/coverage/`, `client/coverage/`) |
| `npm run lint` | ESLint on the whole repository |
| `npm run test:e2e` | Playwright E2E tests: starts its own server (port 3101) and client (port 5174) |

Single workspace: `npm test -w server`, `npm run dev -w client`, …

## Settings

Every setting has a default; see `.env.example`.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `3001` | server port |
| `TZ` | `Europe/Rome` | hut local time (set by the server if missing) |
| `DATA_DIR` | `server/data` | folder of `mountain-hut.db` and `sessions.db` |
| `SESSION_SECRET` | dev value | session cookie secret |
| `FAKE_NOW` | – | fixed "now" in hut local time, for E2E tests and demos only |

## Tests

- Tests never touch the development database: every server test file uses its own temporary DB (`server/test/helpers/testDb.js`) and can fix the clock (`server/test/helpers/fixedClock.js`).
- E2E tests run on their own data folder (`e2e/.tmp/`) with a fixed clock, on a desktop window and on a 360 px phone.
- Every E2E test checks accessibility with `expectAccessible(page)` (`e2e/helpers/axe.js`): no serious or critical axe violations.
- Manual checks are recorded in `docs/manual-tests.md`.

## Project structure

```
server/src/
  index.js            starts the server (reads config.js first)
  config.js           settings from env variables
  app.js              ★ mounts every route of the sprint – stories fill their own route file
  clock.js            now(): the only source of the current time (FAKE_NOW / setNow in tests)
  errors.js           BadRequest, Unauthorized, Forbidden, NotFound, Conflict → { error }
  routes/             one file per area: auth, publicSlots, bookings, slots, availability, testSupport
  middleware/         errorHandler, notFound
  notifications/      notifier.js: bookingConfirmed() hook (called by MH-01, filled by MH-03)
server/test/          helpers/, unit/, integration/
client/src/           React app (App.jsx is a placeholder until U7 Common UI)
client/test/          unit tests (React Testing Library)
e2e/                  Playwright tests, one spec per story, helpers/axe.js
docs/                 manual tests
```
