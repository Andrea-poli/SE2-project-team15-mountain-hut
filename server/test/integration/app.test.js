import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { Conflict, Forbidden } from '../../src/errors.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('app skeleton', () => {
  const app = createApp();

  it('answers unknown API endpoints with 404 and { error }', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No API endpoint for GET /api/nothing-here' });
  });

  it('mounts the sprint routes (empty until the stories fill them)', async () => {
    for (const url of ['/api/auth/me', '/api/public/slots', '/api/bookings/1', '/api/slots', '/api/availability']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body.error, url).toMatch(/^No API endpoint/);
    }
  });

  it('answers a malformed JSON body with 400', async () => {
    const res = await request(app).post('/api/bookings').set('Content-Type', 'application/json').send('{"slotId":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });

  it('does not reveal the framework', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handler', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  afterAll(() => errorSpy.mockRestore());

  const app = express();
  app.get('/forbidden', () => {
    throw new Forbidden();
  });
  app.get('/conflict', async () => {
    throw new Conflict('Not available anymore'); // async errors are caught by Express 5
  });
  app.get('/crash', () => {
    throw new Error('SQLITE_ERROR: no such table: bookings');
  });
  app.use(errorHandler);

  it('turns app errors into their status and message', async () => {
    const res = await request(app).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'This action is not available for your role' });
  });

  it('handles errors thrown in async handlers', async () => {
    const res = await request(app).get('/conflict');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Not available anymore' });
  });

  it('never shows technical details to the user', async () => {
    const res = await request(app).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong, please try again' });
    expect(errorSpy).toHaveBeenCalled();
  });
});
