// D1 – production build: Express serves the built React client (client/dist) on the same port as the API,
// so one container and one address are enough. In development Vite serves the client instead (npm run dev).
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

/**
 * Router for the built client: the files of client/dist, and index.html for every other GET, because the
 * pages (/login, /staff/slots, …) are routes of the React app, not files: a refresh must open the app.
 * @param {string} distDir folder of the build (it must contain index.html)
 */
export function clientRouter(distDir) {
  const indexHtml = path.join(distDir, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`The built client is missing (${indexHtml}): run "npm run build" first.`);
  }
  const router = express.Router();
  // Vite puts a content hash in every file name under assets/: browsers can keep them for a year.
  router.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
  // A missing asset is a 404, not the app page: the browser would try to run HTML as JavaScript.
  router.use('/assets', (req, res) => res.status(404).end());
  router.use(express.static(distDir, { index: false }));
  router.get('/{*page}', (req, res) => {
    res.set('Cache-Control', 'no-cache'); // always the index.html of the latest build
    res.sendFile(indexHtml);
  });
  return router;
}
