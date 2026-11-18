import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, areRequirementsValid, isBlank, isEmail } from '../../../src/utils/validation.js';

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

// MH-05: party requirements, as the contract wants them (openapi Requirement).
describe('areRequirementsValid', () => {
  it('accepts no requirements and the PO example (each with its allergies flag)', () => {
    expect(areRequirementsValid([])).toBe(true);
    expect(
      areRequirementsValid([
        { hasAllergies: true, description: '1 vegan, peanut allergy' },
        { hasAllergies: true, description: '1 shellfish allergy' },
        { hasAllergies: false, description: '2 vegetarians' },
      ]),
    ).toBe(true);
  });

  it.each([
    ['an empty description', [{ hasAllergies: false, description: '' }]],
    ['a description of spaces only', [{ hasAllergies: true, description: '   ' }]],
    ['a missing description', [{ hasAllergies: false }]],
    ['a missing allergies flag', [{ description: '2 vegetarians' }]],
    ['a flag that is not true or false', [{ hasAllergies: 'yes', description: '2 vegetarians' }]],
    ['an item that is null', [null]],
    ['a value that is not a list', { hasAllergies: false, description: '2 vegetarians' }],
  ])('refuses %s', (_what, requirements) => {
    expect(areRequirementsValid(requirements)).toBe(false);
  });
});
