// Starts the server. config.js is imported first: it sets TZ and checks the settings before anything else runs.
import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(config.port, () => {
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
