import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the client calls /api on its own origin and Vite forwards it to the server:
// same origin, so the session cookie works and no CORS is needed.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
    env: { TZ: 'Europe/Rome' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
