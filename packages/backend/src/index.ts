// instrument MUST be the first import — it initializes Sentry + OpenTelemetry
// instrumentation, which needs to hook into module loading before any other
// code runs. Side-effect import intentionally.
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
