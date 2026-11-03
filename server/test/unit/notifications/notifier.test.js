// MH-03 BT1 – notifier.bookingConfirmed(): the hook called by MH-01 after a booking is saved.
// It sends the confirmation email to the hiker and never throws: a failed email must not undo the booking.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturedEmails, clearCapturedEmails, setTransport } from '../../../src/notifications/mailer.js';
import { bookingConfirmed } from '../../../src/notifications/notifier.js';

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
