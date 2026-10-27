// Starts the server. config.js is imported first: it sets TZ and checks the settings before anything else runs.
import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();

// Express 5 passes listen errors (e.g. port already in use) to the callback: without this check
// the server would print "Mountain Hut API on …" and then stop without saying why.
app.listen(config.port, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      err.message = `Port ${config.port} is already in use: stop the other server or set another PORT in .env (${err.message})`;
    }
    throw err;
  }
  console.log(`Mountain Hut API on http://localhost:${config.port} (${config.env}, TZ=${process.env.TZ})`);
  if (config.fakeNow) {
    console.warn(
      [
        '',
        '  ⚠  FAKE_NOW is active: the server lives on a fixed day and time,',
        `     ${process.env.FAKE_NOW} (hut local time). Remove it from .env for real use.`,
        '',
      ].join('\n'),
    );
  }
});
