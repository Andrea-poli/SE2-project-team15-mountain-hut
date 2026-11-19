// MH-07 FT1 – utils/hikerPanel.js, from the contract (openapi NewStaffBooking, StaffNewHiker, TemporaryHiker,
// HikerSummary) and the story: exactly one of hikerId | newHiker | temporaryHiker; a new hiker has the fields
// and checks of Register except the password (PO #36); a quick entry is a first name and an optional phone
// (PO #5). Messages are checked by meaning, the exact wording is the page's.
import { describe, expect, it } from 'vitest';
import {
  EMPTY_HIKER,
  hikerPanelFieldIds,
  hikerSummaryText,
  staffBookingHiker,
  validateHiker,
} from '../../../src/utils/hikerPanel.js';

const NEW_HIKER = {
  firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com', phone: '+393335551234', notes: '',
  emergencyContact: '',
};
const value = (over) => ({ ...EMPTY_HIKER, ...over });
const whoKeys = (body) => Object.keys(body).filter((k) => body[k] !== undefined);

describe('EMPTY_HIKER', () => {
  it('has no hiker chosen and empty fields in every mode', () => {
    expect(EMPTY_HIKER.hikerId).toBeNull();
    expect(Object.values(EMPTY_HIKER.newHiker).every((v) => v === '')).toBe(true);
    expect(Object.values(EMPTY_HIKER.temporaryHiker).every((v) => v === '')).toBe(true);
    expect(EMPTY_HIKER.newHiker).not.toHaveProperty('password');
  });
});

describe('hikerPanelFieldIds', () => {
  it('lists the fields of each mode in form order, with ids unique in the page', () => {
    expect(Object.keys(hikerPanelFieldIds('p', 'existing'))).toEqual(['hikerId']);
    expect(Object.keys(hikerPanelFieldIds('p', 'new'))).toEqual([
      'firstName', 'lastName', 'email', 'phone', 'notes', 'emergencyContact',
    ]);
    expect(Object.keys(hikerPanelFieldIds('p', 'quick'))).toEqual(['firstName', 'lastName', 'phone']);
    const all = ['existing', 'new', 'quick'].flatMap((mode) => Object.values(hikerPanelFieldIds('p', mode)));
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => id.startsWith('p-'))).toBe(true);
  });
});

describe('validateHiker', () => {
  it('existing: a hiker must be chosen', () => {
    expect(Object.keys(validateHiker(value({ mode: 'existing' })))).toEqual(['hikerId']);
    expect(validateHiker(value({ mode: 'existing', hikerId: 4 }))).toEqual({});
  });

  it('new: first name, last name, email and phone are required; notes and emergency contact are not', () => {
    expect(Object.keys(validateHiker(value({ mode: 'new' }))).sort()).toEqual(
      ['email', 'firstName', 'lastName', 'phone'],
    );
    expect(validateHiker(value({ mode: 'new', newHiker: NEW_HIKER }))).toEqual({});
  });

  it('new: blank texts count as empty', () => {
    const blank = { ...NEW_HIKER, firstName: '  ', lastName: ' ', email: ' ', phone: '' };
    expect(Object.keys(validateHiker(value({ mode: 'new', newHiker: blank }))).sort()).toEqual(
      ['email', 'firstName', 'lastName', 'phone'],
    );
  });

  it('new: refuses an invalid email and phone, with the messages of Register', () => {
    const errors = validateHiker(value({ mode: 'new', newHiker: { ...NEW_HIKER, email: 'paolo@', phone: '+3912' } }));
    expect(errors.email).toBe('Enter a valid email, e.g. name@example.com.');
    expect(errors.phone).toBe('Enter a valid mobile number for the chosen country.');
  });

  it('new: applies the length limits of Register (counted after trimming)', () => {
    const long = {
      ...NEW_HIKER,
      firstName: 'x'.repeat(101),
      lastName: 'y'.repeat(101),
      notes: 'n'.repeat(501),
      emergencyContact: 'e'.repeat(201),
    };
    expect(validateHiker(value({ mode: 'new', newHiker: long }))).toEqual({
      firstName: 'First name must be 100 characters or fewer.',
      lastName: 'Last name must be 100 characters or fewer.',
      notes: 'Notes must be 500 characters or fewer.',
      emergencyContact: 'Emergency contact must be 200 characters or fewer.',
    });
    const atLimit = { ...NEW_HIKER, firstName: ` ${'x'.repeat(100)} `, notes: 'n'.repeat(500) };
    expect(validateHiker(value({ mode: 'new', newHiker: atLimit }))).toEqual({});
  });

  it('quick: only the first name is required; last name and phone are optional', () => {
    expect(Object.keys(validateHiker(value({ mode: 'quick' })))).toEqual(['firstName']);
    const giulia = { firstName: 'Giulia', lastName: '', phone: '' };
    expect(validateHiker(value({ mode: 'quick', temporaryHiker: giulia }))).toEqual({});
  });

  it('quick: refuses an invalid phone and too long names', () => {
    const wrong = { firstName: 'x'.repeat(101), lastName: 'y'.repeat(101), phone: '+3912' };
    expect(Object.keys(validateHiker(value({ mode: 'quick', temporaryHiker: wrong }))).sort()).toEqual(
      ['firstName', 'lastName', 'phone'],
    );
    const ok = { firstName: 'Giulia', lastName: 'Bianchi', phone: '+393337654321' };
    expect(validateHiker(value({ mode: 'quick', temporaryHiker: ok }))).toEqual({});
  });

  it('checks only the fields of the mode shown', () => {
    const typedEverywhere = value({
      mode: 'quick',
      newHiker: { ...NEW_HIKER, email: 'wrong' },
      temporaryHiker: { firstName: 'Giulia', lastName: '', phone: '' },
    });
    expect(validateHiker(typedEverywhere)).toEqual({});
  });
});

describe('staffBookingHiker', () => {
  it('existing: only hikerId', () => {
    const body = staffBookingHiker(value({ mode: 'existing', hikerId: 4, newHiker: NEW_HIKER }));
    expect(body).toEqual({ hikerId: 4 });
    expect(whoKeys(body)).toEqual(['hikerId']);
  });

  it('new: only newHiker, trimmed, without empty optional fields and without a password', () => {
    const typed = { ...NEW_HIKER, firstName: ' Paolo ', email: ' paolo.neri@example.com ', notes: '  ',
      emergencyContact: ' Anna 333 ' };
    const body = staffBookingHiker(value({ mode: 'new', hikerId: 4, newHiker: typed }));
    expect(whoKeys(body)).toEqual(['newHiker']);
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      newHiker: { firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com', phone: '+393335551234',
        emergencyContact: 'Anna 333' },
    });
  });

  it('quick: only temporaryHiker, with the phone and last name only when given', () => {
    const typed = { firstName: ' Giulia ', lastName: ' ', phone: '' };
    const body = staffBookingHiker(value({ mode: 'quick', hikerId: 4, temporaryHiker: typed }));
    expect(whoKeys(body)).toEqual(['temporaryHiker']);
    expect(JSON.parse(JSON.stringify(body))).toEqual({ temporaryHiker: { firstName: 'Giulia' } });

    const full = { firstName: 'Giulia', lastName: ' Bianchi ', phone: '+393337654321' };
    expect(staffBookingHiker(value({ mode: 'quick', temporaryHiker: full }))).toEqual({
      temporaryHiker: { firstName: 'Giulia', lastName: 'Bianchi', phone: '+393337654321' },
    });
  });
});

describe('hikerSummaryText', () => {
  it('shows name, email and phone of a regular hiker', () => {
    expect(
      hikerSummaryText({ firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com',
        phone: '+39 333 1234567', temporary: false }),
    ).toBe('Marco Rossi · marco.rossi@example.com · +39 333 1234567');
  });

  it('marks a temporary hiker and skips the missing (null) parts', () => {
    expect(hikerSummaryText({ firstName: 'Giulia', lastName: null, email: null, phone: null, temporary: true })).toBe(
      'Giulia · temporary hiker',
    );
  });
});
