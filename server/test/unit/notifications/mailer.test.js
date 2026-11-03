// MH-03 BT1 – mailer.js: which transport is used, the captured mailbox of the tests, errors.
// Vitest runs with NODE_ENV=test (vitest.config.js): emails are captured, never sent.
import nodemailer from 'nodemailer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capturedEmails,
  clearCapturedEmails,
  sendMail,
  setTransport,
} from '../../../src/notifications/mailer.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

const email = { to: 'hannah@example.com', subject: 'Hello', text: 'Body' };

describe('mailer', () => {
  useFixedClock('2026-11-02T10:00');
  beforeEach(() => clearCapturedEmails());
  afterEach(() => {
    setTransport(null);
    vi.restoreAllMocks();
  });

  describe('in tests (NODE_ENV test or e2e)', () => {
    it('captures the email instead of sending it, with the time of the fixed clock', async () => {
      await sendMail(email);
      expect(capturedEmails()).toEqual([{ ...email, sentAt: new Date(2026, 10, 2, 10, 0).toISOString() }]);
    });

    it('captures also with NODE_ENV=e2e, even when an SMTP server is set', async () => {
      await sendMail(email, { NODE_ENV: 'e2e', SMTP_HOST: 'smtp.example.com' });
      expect(capturedEmails()).toHaveLength(1);
    });

    it('builds the whole message, with the default sender or MAIL_FROM', async () => {
      const info = await sendMail(email, { NODE_ENV: 'test' });
      expect(JSON.parse(info.message)).toMatchObject({
        from: { address: 'no-reply@mountain-hut.example', name: 'Mountain Hut' },
        to: [{ address: 'hannah@example.com' }],
        subject: 'Hello',
        text: 'Body',
      });
      const custom = await sendMail(email, { NODE_ENV: 'test', MAIL_FROM: 'Hut <hut@example.com>' });
      expect(JSON.parse(custom.message).from).toEqual({ address: 'hut@example.com', name: 'Hut' });
    });

    it('filters by recipient ignoring case, oldest first', async () => {
      await sendMail(email);
      await sendMail({ ...email, to: 'anna@example.com', subject: 'Other' });
      await sendMail({ ...email, subject: 'Second' });
      expect(capturedEmails('HANNAH@example.com').map((e) => e.subject)).toEqual(['Hello', 'Second']);
      expect(capturedEmails()).toHaveLength(3);
    });

    it('returns copies and empties the mailbox on clear', async () => {
      await sendMail(email);
      capturedEmails()[0].subject = 'changed';
      expect(capturedEmails()[0].subject).toBe('Hello');
      clearCapturedEmails();
      expect(capturedEmails()).toEqual([]);
    });
  });

  it('in development without SMTP_HOST prints the email on the console and captures nothing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendMail(email, { NODE_ENV: 'development' });
    expect(log).toHaveBeenCalledWith('[mail] to hannah@example.com: Hello\nBody\n');
    expect(capturedEmails()).toEqual([]);
  });

  // Real SMTP (demo and release): nodemailer.createTransport is replaced, so no network is used.
  // The test checks the settings passed to Nodemailer and that nothing is captured or printed.
  describe('with SMTP_HOST outside the tests', () => {
    function fakeSmtp() {
      const transport = { sendMail: vi.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
      const createTransport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
      return { transport, createTransport };
    }

    it('sends through the SMTP server, with port 587 and no TLS or login by default', async () => {
      const { transport, createTransport } = fakeSmtp();
      const log = vi.spyOn(console, 'log');
      // No NODE_ENV = development, as when the server is started with npm run dev.
      const info = await sendMail(email, { SMTP_HOST: 'smtp.example.com' });

      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: undefined,
      });
      expect(transport.sendMail).toHaveBeenCalledWith({
        from: 'Mountain Hut <no-reply@mountain-hut.example>',
        to: 'hannah@example.com',
        subject: 'Hello',
        text: 'Body',
      });
      expect(info).toEqual({ messageId: 'smtp-1' });
      expect(capturedEmails()).toEqual([]);
      expect(log).not.toHaveBeenCalled();
    });

    it('reads port, TLS, login and sender from the env variables (production too)', async () => {
      const { transport, createTransport } = fakeSmtp();
      await sendMail(email, {
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'hut',
        SMTP_PASS: 'secret',
        MAIL_FROM: 'Hut <hut@example.com>',
      });

      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'hut', pass: 'secret' },
      });
      expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'Hut <hut@example.com>' }));
    });

    it('throws when the SMTP server refuses the email', async () => {
      const { transport } = fakeSmtp();
      transport.sendMail.mockRejectedValue(new Error('535 Authentication failed'));
      await expect(sendMail(email, { NODE_ENV: 'development', SMTP_HOST: 'smtp.example.com' })).rejects.toThrow(
        '535 Authentication failed',
      );
    });
  });

  it('uses the transport set with setTransport, until it is reset', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) };
    setTransport(transport);
    await expect(sendMail(email)).resolves.toEqual({ messageId: 'x' });
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: email.to, subject: 'Hello' }));
    expect(capturedEmails()).toEqual([]);

    setTransport(null);
    await sendMail(email);
    expect(capturedEmails()).toHaveLength(1);
  });

  it('throws when the transport fails (the notifier decides what to do)', async () => {
    setTransport({ sendMail: vi.fn().mockRejectedValue(new Error('SMTP down')) });
    await expect(sendMail(email)).rejects.toThrow('SMTP down');
    expect(capturedEmails()).toEqual([]);
  });
});
