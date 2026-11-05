// E2E tests (planning DoD): their own server and client, a dedicated DB, a fixed clock (server and browser).
// First time on a new computer: npx playwright install chromium
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { E2E_NOW } from './e2e/helpers/clock.js';

// Dates computed in the test code use hut time on any machine (e.g. a CI running in UTC).
process.env.TZ = 'Europe/Rome';

const SERVER_PORT = 3101;
const CLIENT_PORT = 5174;
const E2E_DATA = path.resolve('e2e/.tmp');

export default defineConfig({
  testDir: 'e2e',
  // One shared E2E database: run the tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    timezoneId: 'Europe/Rome',
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The smallest phone we support (planning 4.6): 360 px wide
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w server',
      port: SERVER_PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(SERVER_PORT),
        NODE_ENV: 'e2e',
        TZ: 'Europe/Rome',
        FAKE_NOW: E2E_NOW,
        // Explicit paths and a dummy secret: values set here win over .env,
        // so the E2E tests never use the dev database or a real secret.
        DB_PATH: path.join(E2E_DATA, 'mountain-hut.db'),
        SESSIONS_DB_PATH: path.join(E2E_DATA, 'sessions.db'),
        SESSION_SECRET: 'test-only',
      },
    },
    {
      command: `npm run dev -w client -- --port ${CLIENT_PORT} --strictPort`,
      port: CLIENT_PORT,
      reuseExistingServer: false,
      env: {
        API_TARGET: `http://localhost:${SERVER_PORT}`,
        // E2E always test the real server, whatever is in .env
        VITE_USE_MOCKS: 'false',
      },
    },
  ],
});
