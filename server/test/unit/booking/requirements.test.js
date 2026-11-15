// MH-05 BT1 – unit tests of the party requirements in the booking service, written from the story
// (MH-05 Notes and Clarifications, PO issue #29) and docs/openapi.yaml (schema Requirement, POST /api/bookings).
//
//   Requirement: { hasAllergies: boolean, description: string }, a list per booking, optional;
//   the description is trimmed, empty after trimming → 400; anything else invalid → 400.
import { describe, expect, it } from 'vitest';
import { BadRequest } from '../../../src/errors.js';
import { MESSAGES, validateNewBooking, validateRequirements } from '../../../src/services/bookingService.js';

// The example of the PO (MH-05 clarifications): three requirements, two with allergies.
const PO_EXAMPLE = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: true, description: '1 shellfish allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];

const expectInvalid = (requirements) => {
  expect(() => validateRequirements(requirements)).toThrow(BadRequest);
  expect(() => validateRequirements(requirements)).toThrow(MESSAGES.invalidRequirement);
};

describe('validateRequirements', () => {
  it('gives no requirements when they are absent or an empty list', () => {
    expect(validateRequirements(undefined)).toEqual([]);
    expect(validateRequirements([])).toEqual([]);
  });

  it('keeps one requirement with its allergies flag', () => {
    expect(validateRequirements([{ hasAllergies: false, description: '2 vegetarians' }])).toEqual([
      { hasAllergies: false, description: '2 vegetarians' },
    ]);
    expect(validateRequirements([{ hasAllergies: true, description: '1 nut allergy' }])).toEqual([
      { hasAllergies: true, description: '1 nut allergy' },
    ]);
  });

  it('keeps the PO example: three requirements, in the order given, each with its own flag', () => {
    expect(validateRequirements(PO_EXAMPLE)).toEqual(PO_EXAMPLE);
  });

  it('trims the description, and keeps only the two fields of the contract', () => {
    expect(
      validateRequirements([{ hasAllergies: true, description: '  1 gluten free  ', extra: 'ignored' }]),
    ).toEqual([{ hasAllergies: true, description: '1 gluten free' }]);
  });

  it.each([
    ['an empty description', [{ hasAllergies: false, description: '' }]],
    ['a description of spaces only', [{ hasAllergies: true, description: '   ' }]],
    ['a missing description', [{ hasAllergies: false }]],
    ['a description that is not text', [{ hasAllergies: false, description: 3 }]],
    ['a missing allergies flag', [{ description: '2 vegetarians' }]],
    ['an allergies flag that is not true or false', [{ hasAllergies: 'true', description: '2 vegetarians' }]],
    ['an allergies flag 1 instead of true', [{ hasAllergies: 1, description: '2 vegetarians' }]],
    ['an item that is null', [null]],
    ['an item that is a text', ['2 vegetarians']],
    ['a list that is not a list', { hasAllergies: false, description: '2 vegetarians' }],
    ['null instead of a list', null],
    ['one invalid item among valid ones', [...PO_EXAMPLE, { hasAllergies: false, description: ' ' }]],
  ])('refuses %s (400)', (_what, requirements) => {
    expectInvalid(requirements);
  });
});

describe('validateNewBooking with requirements', () => {
  it('returns the requirements with slot and party size, none when absent', () => {
    expect(validateNewBooking({ slotId: 3, partySize: 2 })).toEqual({ slotId: 3, partySize: 2, requirements: [] });
    expect(validateNewBooking({ slotId: 3, partySize: 7, requirements: PO_EXAMPLE })).toEqual({
      slotId: 3,
      partySize: 7,
      requirements: PO_EXAMPLE,
    });
  });

  it('refuses a booking whose requirements are invalid', () => {
    expect(() =>
      validateNewBooking({ slotId: 3, partySize: 2, requirements: [{ hasAllergies: true, description: '' }] }),
    ).toThrow(MESSAGES.invalidRequirement);
  });
});
