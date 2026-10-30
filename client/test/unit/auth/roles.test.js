import { describe, expect, it } from 'vitest';
import { hasRole, homeFor, nextFor } from '../../../src/auth/roles.js';
import { employee, hiker, warden } from '../../helpers/users.js';

describe('hasRole', () => {
  it('is false when nobody is logged in', () => {
    expect(hasRole(null, ['hiker'])).toBe(false);
  });

  it('checks the role of the user', () => {
    expect(hasRole(hiker, ['hiker'])).toBe(true);
    expect(hasRole(hiker, ['employee'])).toBe(false);
    expect(hasRole(employee, ['hiker'])).toBe(false);
  });

  it('lets the warden pass every employee check, but not the hiker ones', () => {
    expect(hasRole(warden, ['employee'])).toBe(true);
    expect(hasRole(warden, ['hiker'])).toBe(false);
  });
});

describe('homeFor', () => {
  it('sends staff to the slots and everybody else to the home page', () => {
    expect(homeFor(employee)).toBe('/staff/slots');
    expect(homeFor(warden)).toBe('/staff/slots');
    expect(homeFor(hiker)).toBe('/');
    expect(homeFor(null)).toBe('/');
  });
});

describe('nextFor', () => {
  it('goes to next when the user may open it, query included', () => {
    expect(nextFor(hiker, '/book?slotId=3&partySize=2')).toBe('/book?slotId=3&partySize=2');
    expect(nextFor(hiker, '/bookings/7')).toBe('/bookings/7');
    expect(nextFor(warden, '/staff/slots/new')).toBe('/staff/slots/new');
    expect(nextFor(hiker, '/')).toBe('/');
  });

  it('goes to the role first page when next is missing', () => {
    expect(nextFor(hiker, null)).toBe('/');
    expect(nextFor(employee, undefined)).toBe('/staff/slots');
  });

  it('never leaves the site (open redirect)', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'evil.example', 'javascript:alert(1)']) {
      expect(nextFor(hiker, next), next).toBe('/');
    }
  });

  it('does not go back to the login or register page', () => {
    expect(nextFor(hiker, '/login')).toBe('/');
    expect(nextFor(employee, '/register?next=/book')).toBe('/staff/slots');
  });

  it('does not go to a page the role cannot open', () => {
    expect(nextFor(employee, '/book')).toBe('/staff/slots');
    expect(nextFor(hiker, '/staff/slots')).toBe('/');
  });
});
