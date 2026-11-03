import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/dao/db.js';

const app = createApp();
const password = 'correct horse battery staple';

function registration(email = `auth-${randomUUID()}@example.com`) {
  return {
    firstName: 'Kilian',
    lastName: 'Jornet',
    email,
    password,
    phone: '+393331234567',
    notes: 'Mountain guide',
    emergencyContact: 'Grace Hopper',
  };
}

beforeEach(async () => {
  const db = await getDb();
  await db.run('DELETE FROM users');
});

describe('authentication routes and sessions', () => {
  it('registers a user, starts a session, and returns that user from /me', async () => {
    const agent = request.agent(app);
    const userData = registration();
    const registered = await agent.post('/api/auth/register').send(userData);

    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: userData.email,
      phone: '+393331234567',
      role: 'hiker',
    });
    expect(registered.body).not.toHaveProperty('passwordHash');
    expect(registered.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(registered.headers['set-cookie'][0]).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual(registered.body);
  });

  it('rejects duplicate registration and invalid registration bodies with their HTTP errors', async () => {
    const userData = registration();
    await expect(request(app).post('/api/auth/register').send(userData)).resolves.toMatchObject({
      status: 201,
    });

    const duplicate = await request(app).post('/api/auth/register').send({
      ...userData,
      email: userData.email.toUpperCase(),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'Email already in use' });

    const invalid = await request(app).post('/api/auth/register').send({ email: 'invalid' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'First name, last name, email, password and mobile number are required' });
  });

  it('logs in an existing account and requires credentials for login', async () => {
    const userData = registration();
    const agent = request.agent(app);
    const created = await agent.post('/api/auth/register').send(userData);
    const originalCookie = created.headers['set-cookie'][0].match(/connect\.sid=([^;]+)/)[1];
    const loggedIn = await agent.post('/api/auth/login').send({
      email: userData.email.toUpperCase(),
      password,
    });

    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body).toEqual(created.body);
    expect(loggedIn.body).not.toHaveProperty('passwordHash');
    const rotatedCookie = loggedIn.headers['set-cookie'][0].match(/connect\.sid=([^;]+)/)[1];
    expect(rotatedCookie).not.toBe(originalCookie);
    await expect(agent.get('/api/auth/me')).resolves.toMatchObject({ status: 200, body: loggedIn.body });

    const missingCredentials = await request(app).post('/api/auth/login').send({ email: userData.email });
    expect(missingCredentials.status).toBe(400);
    expect(missingCredentials.body).toEqual({ error: 'Email and password are required' });
  });

  it('returns the same unauthorized response for unknown emails and incorrect passwords', async () => {
    const userData = registration();
    await request(app).post('/api/auth/register').send(userData);

    const wrongPassword = await request(app).post('/api/auth/login').send({
      email: userData.email,
      password: 'a different password',
    });
    const unknownEmail = await request(app).post('/api/auth/login').send({
      email: 'unknown@example.com',
      password,
    });

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual({ error: 'Invalid email or password' });
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('rejects guests from /me and clears a session whose user has been deleted', async () => {
    const guest = await request(app).get('/api/auth/me');
    expect(guest.status).toBe(401);
    expect(guest.body).toEqual({ error: 'Not logged in' });

    const userData = registration();
    const agent = request.agent(app);
    const loggedIn = await agent.post('/api/auth/register').send(userData);
    const db = await getDb();
    await db.run('DELETE FROM users WHERE id = ?', [loggedIn.body.id]);

    const response = await agent.get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Not logged in' });
  });

  it('logs out, clears the cookie, and treats repeated logout as successful', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(registration());

    const loggedOut = await agent.post('/api/auth/logout');
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers['set-cookie'][0]).toMatch(/connect\.sid=/);
    expect(loggedOut.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/i);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body).toEqual({ error: 'Not logged in' });

    const repeatedLogout = await request(app).post('/api/auth/logout');
    expect(repeatedLogout.status).toBe(204);
  });
});
