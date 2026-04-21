// Sentry instrumentation is normally loaded via Node's `--import` flag (see
// the "start" / "dev" scripts in package.json), which is what Sentry v10+
// requires for full Express/OpenTelemetry instrumentation. This side-effect
// import is a fallback: if someone runs `node dist/index.js` directly without
// --import, they still get basic error capture (no auto-spans). The import
// is idempotent — Node's module cache ensures Sentry.init runs exactly once.
import './instrument.js';
import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { initEncryption } from './utils/crypto.js';

const port = parseInt(process.env.PORT || '3003', 10);

async function main() {
  // Initialize encryption (reads ENCRYPTION_KEY from env)
  initEncryption();

  // Run migrations on startup
  await runMigrations();

  const app = createApp();

  app.listen(port, () => {
    console.log(`chickenScratch backend running on http://localhost:${port}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
