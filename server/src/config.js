// Settings read from env variables (needed for the Docker release in sprint 2).
// This module is imported first by index.js, so TZ is set before any date is computed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// All dates and times of the hut are in local time (planning 4.2, rule 6).
process.env.TZ ??= 'Europe/Rome';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ?? path.join(serverRoot, 'data');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  env: process.env.NODE_ENV ?? 'development',
  // Main database (U3) and session store (U5): both files live in dataDir,
  // which becomes a Docker volume in sprint 2.
  dbPath: process.env.DB_PATH ?? path.join(dataDir, 'mountain-hut.db'),
  sessionsDbPath: process.env.SESSIONS_DB_PATH ?? path.join(dataDir, 'sessions.db'),
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-secret-change-me',
};

// Routes that exist only for automated tests (e.g. reading captured emails, MH-03).
export const isTestEnv = ['test', 'e2e'].includes(config.env);
