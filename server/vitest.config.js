import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Same time zone as the hut, and test-only routes enabled.
    env: { TZ: 'Europe/Rome', NODE_ENV: 'test' },
    // One temporary DB per test file: test files must not share state.
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/index.js'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
