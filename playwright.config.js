// E2E tests (planning DoD): their own server and client, a dedicated DB, a fixed clock.
// First time on a new computer: npx playwright install chromium
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const SERVER_PORT = 3101;
const CLIENT_PORT = 5174;
// The day and time the E2E tests "live in" (hut local time). The server reads it as FAKE_NOW.
export const E2E_NOW = '2026-11-02T10:00';

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
        DATA_DIR: path.resolve('e2e/.tmp'),
      },
    },
    {
      command: `npm run dev -w client -- --port ${CLIENT_PORT} --strictPort`,
      port: CLIENT_PORT,
      reuseExistingServer: false,
      env: { API_TARGET: `http://localhost:${SERVER_PORT}` },
    },
  ],
});
