import { describe, expect, it } from 'vitest';
import { countryLabels, examplePhone, isPhone, pastedInternationalPhone } from '../../../src/utils/phone.js';

describe('isPhone', () => {
  it('accepts valid numbers in E.164 format', () => {
    expect(isPhone('+393401234567')).toBe(true); // Italy, mobile
    expect(isPhone('+41791234567')).toBe(true); // Switzerland, mobile
  });

  it('refuses empty values, non-strings and numbers that cannot exist', () => {
    for (const value of ['', undefined, null, 3401234567, '+39', '+3912', 'abc']) {
      expect(isPhone(value), String(value)).toBe(false);
    }
  });
});

describe('pastedInternationalPhone', () => {
  it('turns a pasted international number into E.164', () => {
    expect(pastedInternationalPhone(' +41 79 123 45 67 ')).toBe('+41791234567');
    expect(pastedInternationalPhone('+39 340 123 4567')).toBe('+393401234567');
  });

  it('returns null for a national number or text that is not a number', () => {
    expect(pastedInternationalPhone('340 123 4567')).toBeNull();
    expect(pastedInternationalPhone('+ hello')).toBeNull();
  });
});

describe('examplePhone', () => {
  it('gives a mobile example in national format for the chosen country', () => {
    const example = examplePhone('IT');
    expect(example).toMatch(/^3\d{2} \d{3} \d{3,4}$/);
  });

  it('gives undefined when there is no country', () => {
    expect(examplePhone(undefined)).toBeUndefined();
  });
});

describe('countryLabels', () => {
  it('labels each country with its name and calling code', () => {
    expect(countryLabels.IT).toBe('Italy +39');
    expect(countryLabels.CH).toBe('Switzerland +41');
  });
});
