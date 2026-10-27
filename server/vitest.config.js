import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Runs before the imports of every test file: each file gets its own temporary DB,
    // set before config.js reads DB_PATH.
    setupFiles: ['./test/setupTestDb.js'],
    // Hut time zone, test-only routes enabled, dummy session secret (never a real one).
    env: { TZ: 'Europe/Rome', NODE_ENV: 'test', SESSION_SECRET: 'test-only' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/index.js'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
