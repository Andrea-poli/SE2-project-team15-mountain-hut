// MH-08 BT1 – the cancellation stays valid even when the email step itself throws (contract cancelBooking:
// "if the email fails, the booking stays cancelled"). notifier.bookingCancelled never throws by design; here it
// is replaced by one that does, to check the API's own guard. Own file, because vi.mock applies to the whole file.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

vi.mock('../../src/notifications/notifier.js', async (importOriginal) => ({
  ...(await importOriginal()),
  bookingCancelled: vi.fn().mockRejectedValue(new Error('the email hook exploded')),
}));

// "Now": Monday 2 Nov 2026, 10:00 in the hut; the dinner is tomorrow.
useFixedClock('2026-11-02T10:00');
const app = createApp();
const PASSWORD = 'mountain-pass-123';

it('POST /api/bookings/{id}/cancel: the email hook throws → still 200 and the booking stays cancelled', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const db = await getDb();
  const email = `hiker-${randomUUID()}@example.com`;
  await userDao.create(db, {
    email, passwordHash: await hashPassword(PASSWORD), firstName: 'Hannah', lastName: 'Tester', role: 'hiker',
    phone: '+393331234567',
  });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
  const slot = await slotDao.create(db, {
    date: '2026-11-03', startTime: '19:00', endTime: '20:30', label: 'Dinner', status: 'open',
    tables: [{ name: 'T1', seats: 4 }],
  });
  const booked = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 2 });
  expect(booked.status, 'the booking itself').toBe(201);

  const res = await agent.post(`/api/bookings/${booked.body.id}/cancel`);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: booked.body.id, status: 'cancelled', tables: [] });
  expect((await agent.get(`/api/bookings/${booked.body.id}`)).body.status).toBe('cancelled');
  expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(Error)); // logged for the staff
  logged.mockRestore();
});
