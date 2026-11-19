// MH-03 BT1 – notifier.bookingConfirmed(): the hook called by MH-01 after a booking is saved.
// It sends the confirmation email to the hiker and never throws: a failed email must not undo the booking.
// MH-08 BT1 – notifier.bookingCancelled(): same rules after a cancellation (PO #41: every change is emailed;
// the contract: if the email fails the booking stays cancelled). The wording of the email is free.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturedEmails, clearCapturedEmails, setTransport } from '../../../src/notifications/mailer.js';
import { bookingCancelled, bookingChanged, bookingConfirmed } from '../../../src/notifications/notifier.js';

const hiker = { id: 3, firstName: 'Hannah', lastName: 'Hiker', email: 'hannah@example.com' };
const booking = {
  id: 7,
  slot: { id: 2, date: '2026-11-02', startTime: '19:00', endTime: '20:30', label: 'Dinner' },
  partySize: 2,
  tables: [{ slotTableId: 11, tableName: 'T1', seats: 2 }],
  status: 'confirmed',
};

describe('notifier.bookingConfirmed', () => {
  beforeEach(() => clearCapturedEmails());
  afterEach(() => {
    setTransport(null);
    vi.restoreAllMocks();
  });

  it('sends one email to the hiker with the booking details and returns true', async () => {
    await expect(bookingConfirmed(booking, hiker)).resolves.toBe(true);
    const emails = capturedEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: 'hannah@example.com', subject: 'Your booking at the mountain hut is confirmed' });
    expect(emails[0].text).toContain('Booking reference: MH-000007');
    expect(emails[0].text).toContain('Party size: 2 people');
  });

  it('sends nothing to a hiker without an email (temporary hikers, MH-07) and returns false', async () => {
    await expect(bookingConfirmed(booking, { ...hiker, email: null })).resolves.toBe(false);
    await expect(bookingConfirmed(booking, null)).resolves.toBe(false);
    expect(capturedEmails()).toEqual([]);
  });

  it('does not throw when the email fails: it logs the error and returns false', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTransport({ sendMail: vi.fn().mockRejectedValue(new Error('SMTP down')) });
    await expect(bookingConfirmed(booking, hiker)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledWith('Confirmation email for booking 7 not sent:', expect.any(Error));
  });

  it('does not throw when the booking cannot be turned into an email', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(bookingConfirmed({ id: 8 }, hiker)).resolves.toBe(false);
    expect(capturedEmails()).toEqual([]);
  });
});

// MH-06 BT1 – notifier.bookingChanged(): the same contract for the email after a change (PO issue #41).
describe('notifier.bookingChanged', () => {
  beforeEach(() => clearCapturedEmails());
  afterEach(() => {
    setTransport(null);
    vi.restoreAllMocks();
  });

  it('sends one email to the hiker with the new details and returns true', async () => {
    await expect(bookingChanged({ ...booking, partySize: 3 }, hiker)).resolves.toBe(true);
    const emails = capturedEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: 'hannah@example.com', subject: 'Your booking at the mountain hut has been changed' });
    expect(emails[0].text).toContain('Booking reference: MH-000007');
    expect(emails[0].text).toContain('Party size: 3 people');
  });

  it('sends nothing to a hiker without an email and returns false', async () => {
    await expect(bookingChanged(booking, { ...hiker, email: null })).resolves.toBe(false);
    expect(capturedEmails()).toEqual([]);
  });

  it('does not throw when the email fails: it logs the error and returns false', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTransport({ sendMail: vi.fn().mockRejectedValue(new Error('SMTP down')) });
    await expect(bookingChanged(booking, hiker)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledWith('Change email for booking 7 not sent:', expect.any(Error));
  });
});

describe('notifier.bookingCancelled (MH-08)', () => {
  const cancelled = { ...booking, status: 'cancelled', tables: [], requirements: [] };

  beforeEach(() => clearCapturedEmails());
  afterEach(() => {
    setTransport(null);
    vi.restoreAllMocks();
  });

  it('sends one email to the hiker saying the booking is cancelled, and returns true', async () => {
    await expect(bookingCancelled(cancelled, hiker)).resolves.toBe(true);
    const emails = capturedEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('hannah@example.com');
    expect(`${emails[0].subject}\n${emails[0].text}`).toMatch(/cancel/i);
    expect(emails[0].text).toContain('MH-000007');
  });

  it('sends nothing to a hiker without an email (temporary hikers, MH-07) and returns false', async () => {
    await expect(bookingCancelled(cancelled, { ...hiker, email: null })).resolves.toBe(false);
    await expect(bookingCancelled(cancelled, null)).resolves.toBe(false);
    expect(capturedEmails()).toEqual([]);
  });

  it('a slot without a label shows only its time; a party of one is "1 person"', async () => {
    await bookingCancelled({ ...cancelled, partySize: 1, slot: { ...cancelled.slot, label: '' } }, hiker);
    const [{ text }] = capturedEmails();
    expect(text).toContain('19:00');
    expect(text).not.toContain('Dinner');
    expect(text).toMatch(/\b1 person\b/);
  });

  it('does not throw when the email fails: it logs the error and returns false', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTransport({ sendMail: vi.fn().mockRejectedValue(new Error('SMTP down')) });
    await expect(bookingCancelled(cancelled, hiker)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('booking 7'), expect.any(Error));
  });

  it('does not throw when the booking cannot be turned into an email', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(bookingCancelled({ id: 8 }, hiker)).resolves.toBe(false);
    expect(capturedEmails()).toEqual([]);
  });
});
