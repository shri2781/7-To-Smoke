// Loads .env for local dev / the built server. On Render, real env vars are
// injected directly and no .env file exists, so this is a harmless no-op.
import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp();

const port = Number(process.env.PORT) || 3001;
app.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`7 to Smoke server listening on :${port}`);
});
