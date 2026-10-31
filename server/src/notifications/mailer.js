// MH-03 – sends emails. The transport is chosen from env variables:
//   - NODE_ENV test / e2e      → nothing leaves the machine: emails are captured in memory and
//                                 read back through GET /api/test/emails (routes/testSupport.js)
//   - SMTP_HOST set            → real SMTP server (e.g. a test mailbox such as Ethereal or Mailtrap in the demo)
//   - otherwise (local dev)    → the email is printed on the server console instead of being sent
// Nodemailer's jsonTransport builds the full message without any network: used for capture and console.

import nodemailer from 'nodemailer';
import { isTestEnv } from '../config.js';
import { now } from '../clock.js';

const DEFAULT_FROM = 'Mountain Hut <no-reply@mountain-hut.example>';

/** Emails captured in test/e2e, oldest first: { to, subject, text, sentAt }. */
const captured = [];

export function capturedEmails(recipient) {
  const list = recipient ? captured.filter((e) => e.to.toLowerCase() === recipient.toLowerCase()) : captured;
  return list.map((e) => ({ ...e }));
}

export function clearCapturedEmails() {
  captured.length = 0;
}

/** Reads the settings at call time, so tests can change env variables between cases. */
function transportFor(env) {
  if (isTestEnv(env.NODE_ENV || 'development')) return { kind: 'capture', transport: nodemailer.createTransport({ jsonTransport: true }) };
  if (env.SMTP_HOST) {
    return {
      kind: 'smtp',
      transport: nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      }),
    };
  }
  return { kind: 'console', transport: nodemailer.createTransport({ jsonTransport: true }) };
}

let override = null;

/** Tests only: replace the transport (e.g. one that fails) and restore it with setTransport(null). */
export function setTransport(transport) {
  override = transport;
}

/**
 * Sends one plain-text email. Throws if the transport fails: the caller decides what to do
 * (notifier.js logs the error and keeps the booking).
 */
export async function sendMail({ to, subject, text }, env = process.env) {
  const { kind, transport } = override ? { kind: 'override', transport: override } : transportFor(env);
  const info = await transport.sendMail({ from: env.MAIL_FROM || DEFAULT_FROM, to, subject, text });

  if (kind === 'capture') {
    captured.push({ to, subject, text, sentAt: now().toISOString() });
  } else if (kind === 'console') {
    console.log(`[mail] to ${to}: ${subject}\n${text}\n`);
  }
  return info;
}
