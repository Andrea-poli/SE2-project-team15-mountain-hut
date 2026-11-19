// D1 – the built client served by Express in production (clientApp.js, mounted by createApp when a client build
// folder is given; config gives client/dist only with NODE_ENV=production). Written from the D1 task and the
// README (Production): one port for the API and the pages; a page opened directly (or refreshed) gets the app;
// /api stays JSON; a missing asset is a 404, never the app page; the hashed assets can be cached for a year.
// A temporary build folder stands in for client/dist, so the test never needs `npm run build`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { clientRouter } from '../../src/clientApp.js';

const INDEX = '<!doctype html><html><body><div id="root"></div></body></html>';
const ASSET = 'console.log("app");';

let dist;
let app;

beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'mountain-hut-dist-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), INDEX);
  writeFileSync(path.join(dist, 'assets', 'index-AbC123.js'), ASSET);
  writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  app = createApp({ clientDist: dist });
});

afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe('the built client (production, D1)', () => {
  it.each(['/', '/login', '/staff/slots', '/my-bookings/7/change'])(
    'GET %s → the app page (index.html), never cached',
    async (page) => {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toBe(INDEX);
      expect(res.headers['cache-control']).toBe('no-cache');
    },
  );

  it('a hashed asset is served with a cache of one year', async () => {
    const res = await request(app).get('/assets/index-AbC123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toBe(ASSET);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('a missing asset is a 404 with no body, not the app page', async () => {
    const res = await request(app).get('/assets/does-not-exist.js');
    expect(res.status).toBe(404);
    expect(res.text).toBe('');
  });

  it('the other files of the build are served as they are', async () => {
    const res = await request(app).get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
  });

  it('/api stays the API: an unknown API path is a JSON 404, and the health check still answers', async () => {
    const unknown = await request(app).get('/api/nothing-here');
    expect(unknown.status).toBe(404);
    expect(unknown.headers['content-type']).toMatch(/json/);
    expect(unknown.body).toHaveProperty('error');
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  });

  it('only GET gets the app page: another method on a page is a 404', async () => {
    const res = await request(app).post('/staff/slots');
    expect(res.status).toBe(404);
    expect(res.text).not.toBe(INDEX);
  });

  it('without a client build folder (development and tests) no page is served', async () => {
    expect((await request(createApp({ clientDist: null })).get('/login')).status).toBe(404);
  });

  it('refuses to start without index.html, telling to run the build first', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'mountain-hut-empty-'));
    try {
      expect(() => clientRouter(empty)).toThrow(/The built client is missing .*index\.html.*npm run build/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
