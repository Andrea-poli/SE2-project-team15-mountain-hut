// MH-07 FT2 – utils/password.js, the checks of a new password shared by Change password and the reset page.
//
// CONTRACT
//   F5 Same rule as the registration (openapi PasswordChange / reset confirm: at least 8 characters; the form's
//      limit is 128): the new password is required, 8–128 characters counted as typed (spaces included);
//      the confirmation is required and must be equal. The help text tells the minimum length.
import { describe, expect, it } from 'vitest';
import { NEW_PASSWORD_HELP, newPasswordErrors } from '../../../src/utils/password.js';

const check = (newPassword, confirmPassword = newPassword) => newPasswordErrors({ newPassword, confirmPassword });

describe('newPasswordErrors', () => {
  it('accepts 8 and 128 characters, equal confirmation', () => {
    expect(check('12345678')).toEqual({});
    expect(check('a'.repeat(128))).toEqual({});
  });

  it('both fields are required (blank counts as empty)', () => {
    const errors = check('', '');
    expect(Object.keys(errors).sort()).toEqual(['confirmPassword', 'newPassword']);
    expect(errors.newPassword).toMatch(/new password/i);
    expect(errors.confirmPassword).toMatch(/confirm/i);
    expect(Object.keys(check('   ', '   ')).sort()).toEqual(['confirmPassword', 'newPassword']);
  });

  it('refuses fewer than 8 characters, with a message telling the minimum', () => {
    expect(check('1234567').newPassword).toBe('The password must be at least 8 characters long.');
  });

  it('counts the characters as typed: spaces at the ends count', () => {
    expect(check(' 123456 ')).toEqual({});
  });

  it('refuses more than 128 characters, with a message telling the maximum', () => {
    expect(check('a'.repeat(129)).newPassword).toBe('The password must be 128 characters or fewer.');
  });

  it('refuses a confirmation different from the new password', () => {
    expect(check('12345678', '12345679')).toEqual({ confirmPassword: 'The passwords do not match.' });
    expect(check('12345678', '12345678 ')).toEqual({ confirmPassword: 'The passwords do not match.' });
  });

  it('checks the confirmation also when the new password is wrong', () => {
    expect(Object.keys(check('short', 'other')).sort()).toEqual(['confirmPassword', 'newPassword']);
  });
});

describe('NEW_PASSWORD_HELP', () => {
  it('tells the minimum length', () => {
    expect(NEW_PASSWORD_HELP).toMatch(/at least 8 characters/i);
  });
});
