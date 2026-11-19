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

`npm run seed` fills the development database with demo data: slots from 7 days ago to 14 days ahead (lunch, dinner, and a second dinner turn on Saturdays, tables T1–T5) and a few bookings. Dates are relative to today, so the data never gets old: run it again whenever you want a fresh start. It **replaces** every user, slot and booking and logs everybody out; it refuses to run when `NODE_ENV=production`. Unit and integration tests never use it; E2E tests start from it (the E2E server loads it at start, on the fixed E2E day): if you change the demo data, run `npm run test:e2e`.

Demo cases, ready to show:

| Case | Where |
|---|---|
| Party split over two tables ("2 + 8 seats") | tomorrow's dinner |
| Almost full (1 seat left) | tomorrow's lunch |
| Full (listed, cannot be chosen) | the dinner in 3 days |
| Past days, greyed out with "Past" (their bookings are only in the data: no page lists bookings yet) | 3, 2 and 1 days ago in the staff week view |
| Booking closing within 2 hours | today's lunch: set `FAKE_NOW=<today>T10:30` in `.env` and restart, it shows "booking closed" |
| Party requirements with allergies, without allergies | the lunch in 3 days: Luca Verdi (the PO example), Anna Bianchi (1 vegetarian) |
| A temporary hiker booked by staff (no email, cannot log in) | the lunch in 3 days: Giorgio Montano |
| A cancelled booking, then booked again | the lunch in 3 days: Anna Bianchi |
| Change allowed / not allowed (48 h before the meal) | `hiker@example.com`: the dinner in 3 days / tomorrow's dinner |
| Copy a week (MH-09) | this week onto the week after next (it has slots and no bookings: its schedule is replaced); onto a week with bookings still to come it is refused, e.g. next week when the data is loaded Fri–Sun |

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
| `npm run build` | builds the client for production into `client/dist` |
| `npm start` | starts the server only; with `NODE_ENV=production` it also serves `client/dist` |

Single workspace: `npm test -w server`, `npm run dev -w client`, …

## Settings

Read from `.env` in the repository root (template: `.env.example`). Variables already set in the shell, by Playwright or by Docker win over the file. The Vite proxy reads the same `.env`, so it follows `PORT`.

| Variable | Default | Use |
|---|---|---|
| `SESSION_SECRET` | – (required) | session cookie secret, your own random value |
| `PORT` | `3001` | server port |
| `PUBLIC_URL` | `http://localhost:5173` (production: `http://localhost:<PORT>`) | address of the pages, used in the link of the password reset email (MH-07) |
| `TZ` | `Europe/Rome` | hut local time (set by the server if missing) |
| `DATA_DIR` | `server/data` | folder of `mountain-hut.db` and `sessions.db`; relative paths start from the repository root |
| `DB_PATH`, `SESSIONS_DB_PATH` | – | optional: the full path of one database file, instead of `DATA_DIR/mountain-hut.db` and `DATA_DIR/sessions.db` (tests and E2E use them for temporary files). Rarely needed; in Docker leave them out so the data stays in the volume |
| `FAKE_NOW` | – | fixed "now" in hut local time, `YYYY-MM-DDTHH:mm`, for demos only; refused in production, a warning is printed when active. The pages still use the PC clock: e.g. the staff time menu marks a slot "started" by the PC time, so for a demo keep the PC near `FAKE_NOW` |
| `NODE_ENV` | `development` | `production` serves the built client and requires an SMTP server (see Production); don't put it in `.env`: Vite would build in development mode |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | – | SMTP server for the confirmation emails (MH-03): required in production; in development, without `SMTP_HOST` the emails are printed on the console |

## Production

In production the whole application runs on **one port**: Express serves the API under `/api` and the built client for every other address (a page such as `/staff/slots` opened directly, or refreshed, gets the app). The Docker image does this for you (see Docker); without Docker:

```bash
npm ci                                 # dependencies (the first time)
npm run build                          # client → client/dist (VITE_USE_MOCKS must not be true in .env)
NODE_ENV=production npm start          # Windows PowerShell: $env:NODE_ENV="production"; npm start
```

Then open http://localhost:3001. In production:

- `SESSION_SECRET` is required, as always; `FAKE_NOW` is refused.
- Emails are always sent through an SMTP server: set the `SMTP_*` variables, or the server does not start (emails never get lost silently). No SMTP account? https://ethereal.email creates a free test mailbox in one click (`SMTP_HOST=smtp.ethereal.email`, `SMTP_PORT=587`, `SMTP_SECURE=false`, user and password from the page): the emails reach nobody and are read under Messages.
- The server stops at start with a clear message if `client/dist` is missing: run `npm run build` first.
- The session cookie gets the `Secure` flag only over HTTPS.
- Demo data: `npm run seed` refuses `NODE_ENV=production`; load it before (it replaces every user, slot and booking).

## Docker

The image builds the whole application from this repository (client build + server with its production dependencies, Node 22). Every feature merged into `dev` is in the next build; the Dockerfile only changes for new runtime needs.

1. Copy `.env.example` to `.env` next to `docker-compose.yml` and set:
   - `SESSION_SECRET`: required, your own random text (e.g. `openssl rand -hex 32`);
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`: required in production for the confirmation emails (`docker compose` stops at once without `SMTP_HOST`). A free test mailbox from https://ethereal.email takes a minute: the emails are read there and reach nobody.
2. `docker compose up --build` → the whole application (pages and API) on http://localhost:3001 (`HOST_PORT=8080` in `.env` for another port).
3. On the **first start** (empty volume) the demo data is loaded (see Demo accounts). The data lives in the volume `mountain-hut-data` and survives restarts. Back to fresh demo data: `docker compose down -v && docker compose up`. No demo data: `SEED_DEMO_DATA=false`.

Without compose: `docker build -t mountain-hut .` then `docker run -p 3001:3001 -e SESSION_SECRET=… -e SMTP_HOST=… (the other SMTP_* the same way) -v mountain-hut-data:/data mountain-hut`. Don't pass a development `.env` with `--env-file`: its `DATA_DIR`/`PORT` would move the data out of the volume.

The variables are read when the container starts: no secret is ever written into the image (it is public once published). The container runs as the non-root `node` user and has a health check on `GET /api/health` (public, no session, no database), also handy for monitoring.

**Check that a started container works** (e.g. after building it, or on another PC for the deployment test): on a fresh start (`docker compose down -v && docker compose up -d`) run `node docker/smoke-test.js` (or `node docker/smoke-test.js 8080` for another port; it always calls localhost). It calls every API endpoint as a guest, a hiker, an employee and the warden, with the main error answers and the demo data, checks that the pages are served, and prints PASS/FAIL per check (exit code 0 = all passed). It writes a new hiker, a booking and a slot, so run it once per fresh start. The confirmation email is checked in the mailbox (e.g. Ethereal → Messages). Needs Node 22 on the machine running it; without Node, run it inside the container: `docker compose exec mountain-hut node docker/smoke-test.js`.

### Run the published image (Docker Hub, no source code needed)

Release 1 (sprint 2) is the image `fedeangio/mountain-hut:release-1` on Docker Hub: https://hub.docker.com/r/fedeangio/mountain-hut. It runs on Windows, macOS (Intel and Apple silicon) and Linux; all you need is [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux). The image contains the whole application (pages, API, database with the demo data); only the settings with the secrets come from outside.

1. **The settings file.** Choose one:
   - **With the team's secrets file (course instructors).** Download `Team15-secrets.zip` from the "Elaborati" section of the portal and unzip it into an empty folder. It contains `mountain-hut.env`, ready to use: the session secret and the SMTP account of a test mailbox ([Ethereal](https://ethereal.email)) for the booking emails. Don't edit it and don't share it.
   - **With your own settings.** Open https://ethereal.email and click *Create Ethereal Account* (1 minute, free): it shows a user and a password. In an empty folder, create a file `mountain-hut.env` with these lines, replacing each `<…>` with your value, angle brackets included (no quotes, no spaces around `=`):
     ```
     SESSION_SECRET=<a long random text>
     SMTP_HOST=smtp.ethereal.email
     SMTP_PORT=587
     SMTP_SECURE=false
     SMTP_USER=<the Ethereal user>
     SMTP_PASS=<the Ethereal password>
     ```
     For `SESSION_SECRET` any long random text works, e.g. the output of `openssl rand -hex 32` (macOS, Linux) or of `-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })` in Windows PowerShell. Keep this file to yourself: it is read when the container starts and is never part of the image.
2. **Start it**, from the folder of `mountain-hut.env` (the same command on Windows, macOS and Linux):
   ```bash
   docker run -d --name mountain-hut -p 3001:3001 --env-file mountain-hut.env -v mountain-hut-data:/data fedeangio/mountain-hut:release-1
   ```
   Then open http://localhost:3001. On the first start the demo data is loaded, with dates from that day on. Log in with the [Demo accounts](#demo-accounts) (hiker, employee, warden; passwords in that table).
   Port 3001 busy? Use `-p 8080:3001`, open http://localhost:8080, and add the line `PUBLIC_URL=http://localhost:8080` to `mountain-hut.env`, so the link in the password reset email points there.
3. **Read the emails** (booking confirmed, changed or cancelled; password reset link): log in at https://ethereal.email/login with the `SMTP_USER` and `SMTP_PASS` of `mountain-hut.env`, then open *Messages*. The emails reach nobody else: every address of the demo accounts is fake, all the emails land in that mailbox.
4. **Day to day.** `docker logs mountain-hut` shows the startup messages and any error. `docker stop mountain-hut` and `docker start mountain-hut` keep the data (it lives in the volume `mountain-hut-data`). Back to fresh demo data: `docker rm -f mountain-hut`, then `docker volume rm mountain-hut-data`, then start again. A newer image: `docker pull fedeangio/mountain-hut:<tag>`, remove the container and start it again with the new tag. Changed `mountain-hut.env`? A restart is not enough, the settings are read when the container is created: `docker rm -f mountain-hut`, then the `docker run` command above again (the data stays in the volume).

If it does not start, `docker logs mountain-hut` says why: `SESSION_SECRET is missing` or `SMTP_HOST is missing` means a line of `mountain-hut.env` is missing or misspelt. `535 Authentication failed` after a booking means the Ethereal user or password is wrong (the booking is saved anyway, only its email is lost).

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
  seed.js             demo data and seed(db, today), dates relative to today; no side effects on import
  seedCli.js          npm run seed: production check, runs seed(), logs everybody out
server/test/          setupTestDb.js (temporary DB per file), helpers/, unit/, integration/
client/src/           React app (App.jsx is a placeholder until U7 Common UI)
client/test/          unit tests (React Testing Library)
e2e/                  Playwright tests, one spec per story; helpers/ clock.js, axe.js, layout.js
docs/                 manual tests
```

## License

This project is licensed under the [Apache License 2.0](LICENSE).

We chose Apache-2.0 because we want the widest possible reuse of the software,
also in proprietary products and online services, without forcing others to
publish their code. Compared to MIT it adds an explicit patent license and
requires marking changed files; all our dependencies are permissive
(MIT, BSD, ISC, Apache-2.0), so they are compatible with it.
