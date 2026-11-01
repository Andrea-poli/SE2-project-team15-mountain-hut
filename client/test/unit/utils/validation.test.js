import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, isBlank, isEmail } from '../../../src/utils/validation.js';

describe('isBlank', () => {
  it('is true for empty, spaces only and non-strings', () => {
    for (const value of ['', '   ', '\t\n', undefined, null, 42]) {
      expect(isBlank(value), JSON.stringify(value)).toBe(true);
    }
  });

  it('is false for any text', () => {
    expect(isBlank('a')).toBe(false);
    expect(isBlank('  Mario  ')).toBe(false);
  });
});

describe('isEmail', () => {
  it('accepts well-formed addresses, also with spaces around', () => {
    for (const value of ['mario.rossi@example.com', 'a@b.it', '  name+tag@studenti.polito.it ']) {
      expect(isEmail(value), value).toBe(true);
    }
  });

  it('refuses addresses without @, domain or dot, or with spaces inside', () => {
    for (const value of ['mario', 'mario@', '@example.com', 'mario@example', 'mario rossi@example.com', 'a@@b.it']) {
      expect(isEmail(value), value).toBe(false);
    }
  });
});

describe('MIN_PASSWORD_LENGTH', () => {
  it('is 8, as in the API contract', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});
