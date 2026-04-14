import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { initEncryption } from './utils/crypto.js';

const port = parseInt(process.env.PORT || '3003', 10);

// Initialize encryption (reads ENCRYPTION_KEY from env)
initEncryption();

// Run migrations on startup
runMigrations();

const app = createApp();

app.listen(port, () => {
  console.log(`chickenScratch backend running on http://localhost:${port}`);
});
