import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '../../../src/api/client.js';

// A fetch Response with a text body.
const reply = (status, body = '') => new Response(body === null ? null : body, { status });
const json = (status, data) => reply(status, JSON.stringify(data));

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a JSON body with the session cookie and returns the JSON answer', async () => {
    fetch.mockResolvedValue(json(201, { id: 1 }));
    await expect(apiFetch('/api/bookings', { method: 'POST', body: { slotId: 3 } })).resolves.toEqual({ id: 1 });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/bookings');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{"slotId":3}',
    });
  });

  it('sends no body and no Content-Type on a GET', async () => {
    fetch.mockResolvedValue(json(200, []));
    await apiFetch('/api/public/slots?date=2026-11-02');
    const init = fetch.mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('returns null for 204 No Content', async () => {
    fetch.mockResolvedValue(reply(204, null));
    await expect(apiFetch('/api/auth/logout', { method: 'POST' })).resolves.toBeNull();
  });

  it('throws ApiError with the status and the server message ({ error })', async () => {
    fetch.mockResolvedValue(json(409, { error: 'Not available anymore' }));
    const err = await apiFetch('/api/bookings').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: 'Not available anymore' });
  });

  it('uses a generic message when the error has no { error } body', async () => {
    fetch.mockResolvedValue(reply(502, '<html>Bad Gateway</html>'));
    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({
      status: 502,
      message: 'Something went wrong. Please try again.',
    });
  });

  it('throws when a successful answer is not JSON (e.g. a proxy page)', async () => {
    fetch.mockResolvedValue(reply(200, '<!doctype html>'));
    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({ status: 200 });
  });

  it('gives status 0 when the server cannot be reached', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({ status: 0, message: 'Cannot reach the server.' });
  });
});
