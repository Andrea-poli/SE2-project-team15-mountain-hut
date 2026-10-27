import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  // Same .env as the server (repository root). Values already set win over the file,
  // like in the server: Playwright's API_TARGET keeps working.
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env };
  // In development the client calls /api on its own origin and Vite forwards it to the server:
  // same origin, so the session cookie works and no CORS is needed.
  const apiTarget = env.API_TARGET || `http://localhost:${env.PORT || 3001}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // If 5173 is busy, stop with a clear error instead of moving to 5174 (the E2E port).
      strictPort: true,
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
  };
});
