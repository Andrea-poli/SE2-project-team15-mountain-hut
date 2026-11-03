// MH-03 BT2 – GET/DELETE /api/test/emails: the captured mailbox read by the E2E tests.
// It exists only when NODE_ENV is test or e2e: never in development or in the release.
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { bookingConfirmed } from '../../src/notifications/notifier.js';
import { closeSessionStore } from '../../src/session.js';

const app = createApp();
// The test below reloads the modules: setupTestDb.js would then close only the new session store.
// Close this one here, or Windows cannot delete the temporary folder.
afterAll(() => closeSessionStore());
const hiker = (email) => ({ id: 1, firstName: 'Hannah', lastName: 'Hiker', email });
const booking = (id) => ({
  id,
  slot: { id: 1, date: '2026-11-02', startTime: '19:00', endTime: '20:30', label: 'Dinner' },
  partySize: 2,
  tables: [{ slotTableId: 1, tableName: 'T1', seats: 2 }],
  status: 'confirmed',
});

describe('/api/test/emails (NODE_ENV=test)', () => {
  beforeEach(() => request(app).delete('/api/test/emails').expect(204));

  it('starts empty', async () => {
    const res = await request(app).get('/api/test/emails').expect(200);
    expect(res.body).toEqual([]);
  });

  it('lists the confirmation emails, oldest first', async () => {
    // Sent in an order that is neither by booking id nor by recipient: only the sending order fits.
    await bookingConfirmed(booking(2), hiker('hannah@example.com'));
    await bookingConfirmed(booking(1), hiker('anna@example.com'));

    const res = await request(app).get('/api/test/emails').expect(200);
    expect(res.body.map((e) => e.to)).toEqual(['hannah@example.com', 'anna@example.com']);
    expect(res.body[0]).toEqual({
      to: 'hannah@example.com',
      subject: 'Your booking at the mountain hut is confirmed',
      text: expect.stringContaining('Booking reference: MH-000002'),
      sentAt: expect.any(String),
    });
  });

  it('filters by recipient, ignoring case', async () => {
    await bookingConfirmed(booking(1), hiker('hannah@example.com'));
    await bookingConfirmed(booking(2), hiker('anna@example.com'));

    const res = await request(app).get('/api/test/emails').query({ recipient: 'ANNA@example.com' }).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toContain('MH-000002');
  });

  it('DELETE empties the mailbox', async () => {
    await bookingConfirmed(booking(1), hiker('hannah@example.com'));
    await request(app).delete('/api/test/emails').expect(204);
    expect((await request(app).get('/api/test/emails')).body).toEqual([]);
  });
});

describe('/api/test/emails outside the tests', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not exist in development (404 like any unknown address)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules(); // config.js reads NODE_ENV when it is loaded
    const { createApp: createDevApp } = await import('../../src/app.js');
    const devSession = await import('../../src/session.js');
    const devApp = createDevApp();
    try {
      const res = await request(devApp).get('/api/test/emails');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/^No API endpoint/);
      expect((await request(devApp).delete('/api/test/emails')).status).toBe(404);
    } finally {
      await devSession.closeSessionStore();
    }
  });
});
