import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, isTestEnv, loadConfig } from '../../src/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = { SESSION_SECRET: 'test-only' };

describe('loadConfig', () => {
  it('uses the defaults when nothing is set', () => {
    const config = loadConfig(base);
    expect(config.env).toBe('development');
    expect(config.port).toBe(3001);
    expect(config.dbPath).toBe(path.join(repoRoot, 'server', 'data', 'mountain-hut.db'));
    expect(config.sessionsDbPath).toBe(path.join(repoRoot, 'server', 'data', 'sessions.db'));
    expect(config.fakeNow).toBeNull();
  });

  it('reads a relative DATA_DIR from the repository root, not from server/', () => {
    const config = loadConfig({ ...base, DATA_DIR: './server/data' });
    expect(config.dbPath).toBe(path.join(repoRoot, 'server', 'data', 'mountain-hut.db'));
  });

  it('keeps an absolute DATA_DIR as it is, and falls back to server/data when it is empty', () => {
    const absolute = path.join(repoRoot, 'e2e', '.tmp');
    expect(loadConfig({ ...base, DATA_DIR: absolute }).dbPath).toBe(path.join(absolute, 'mountain-hut.db'));
    expect(loadConfig({ ...base, DATA_DIR: '' }).dbPath).toBe(path.join(repoRoot, 'server', 'data', 'mountain-hut.db'));
  });

  it('stops when SESSION_SECRET is missing (no secret is written in the code)', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ SESSION_SECRET: '' })).toThrow(/SESSION_SECRET is missing/);
  });

  it('accepts a valid FAKE_NOW in hut local time', () => {
    const config = loadConfig({ ...base, FAKE_NOW: '2026-11-02T10:00' });
    expect(config.fakeNow.toISOString()).toBe('2026-11-02T09:00:00.000Z');
  });

  it('stops on an invalid FAKE_NOW', () => {
    expect(() => loadConfig({ ...base, FAKE_NOW: '02/11/2026' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, FAKE_NOW: '2026-11-31T10:00' })).toThrow(/not a valid day/);
  });

  it('refuses FAKE_NOW in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', FAKE_NOW: '2026-11-02T10:00' })).toThrow(
      /not allowed when NODE_ENV is production/,
    );
  });
});

describe('isTestEnv', () => {
  it('is true only for automated tests, so /api/test never reaches a release', () => {
    expect(isTestEnv('test')).toBe(true);
    expect(isTestEnv('e2e')).toBe(true);
    expect(isTestEnv('production')).toBe(false);
    expect(isTestEnv('development')).toBe(false);
    expect(isTestEnv(loadConfig(base).env)).toBe(false); // NODE_ENV not set
  });
});
