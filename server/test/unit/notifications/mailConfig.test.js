// MH-03 BT1 – config.js: in production the server refuses to start without an SMTP server,
// so confirmation emails are never lost silently (printed on a console nobody reads).
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config.js';

const base = { SESSION_SECRET: 'test-only' };

describe('config: SMTP_HOST', () => {
  it('is required in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/SMTP_HOST is missing/);
  });

  it('is enough to start in production', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' }).env).toBe('production');
  });

  it('is optional in development, test and e2e', () => {
    for (const NODE_ENV of ['development', 'test', 'e2e', undefined]) {
      expect(() => loadConfig({ ...base, NODE_ENV }), String(NODE_ENV)).not.toThrow();
    }
  });
});
