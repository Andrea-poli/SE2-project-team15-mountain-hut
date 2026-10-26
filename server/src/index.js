// Starts the server. config.js is imported first: it sets TZ before anything else runs.
import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Mountain Hut API on http://localhost:${config.port} (${config.env}, TZ=${process.env.TZ})`);
});
