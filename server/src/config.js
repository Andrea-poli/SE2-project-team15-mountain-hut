// Settings read from env variables (needed for the Docker release in sprint 2).
// This module is imported first by index.js, so TZ is set before any date is computed.
// In development the server scripts load the repository's .env (node --env-file-if-exists=../.env);
// variables already set (Playwright, Docker, the shell) win over the file.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFakeNow } from './clock.js';

// All dates and times of the hut are in local time (planning 4.2, rule 6).
process.env.TZ ??= 'Europe/Rome';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');

export class ConfigError extends Error {
  name = 'ConfigError';
}

/**
 * Reads and checks the settings. Throws ConfigError with a clear message when a setting is wrong,
 * so the server stops at startup instead of misbehaving later.
 * @param {Record<string, string | undefined>} env usually process.env (tests pass their own object)
 */
export function loadConfig(env) {
  const nodeEnv = env.NODE_ENV || 'development';

  // Relative paths (e.g. DATA_DIR=./server/data in .env) are read from the repository root,
  // not from server/ where the scripts run. An empty value falls back to server/data.
  const dataDir = env.DATA_DIR ? path.resolve(repoRoot, env.DATA_DIR) : path.join(serverRoot, 'data');

  if (!env.SESSION_SECRET) {
    throw new ConfigError(
      'SESSION_SECRET is missing. Copy .env.example to .env and set your own secret (see README, Getting started).',
    );
  }

  let fakeNow = null;
  if (env.FAKE_NOW) {
    if (nodeEnv === 'production') {
      throw new ConfigError('FAKE_NOW is not allowed when NODE_ENV is production: remove it.');
    }
    try {
      fakeNow = parseFakeNow(env.FAKE_NOW);
    } catch (err) {
      throw new ConfigError(err.message);
    }
  }

  return {
    env: nodeEnv,
    port: Number(env.PORT || 3001),
    // Main database (U3) and session store (U5), both in dataDir: a Docker volume in sprint 2.
    dbPath: env.DB_PATH ? path.resolve(repoRoot, env.DB_PATH) : path.join(dataDir, 'mountain-hut.db'),
    sessionsDbPath: env.SESSIONS_DB_PATH
      ? path.resolve(repoRoot, env.SESSIONS_DB_PATH)
      : path.join(dataDir, 'sessions.db'),
    sessionSecret: env.SESSION_SECRET,
    fakeNow,
  };
}

/** Routes that exist only for automated tests (e.g. reading captured emails, MH-03). */
export function isTestEnv(nodeEnv) {
  return nodeEnv === 'test' || nodeEnv === 'e2e';
}

export const config = loadConfig(process.env);
