import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUsersByEmailFragment,
  createSession,
  findSession,
  deleteSession,
  updatePassword,
  seedAccounts,
} from './auth.js';
import { ensureSchema } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config from env. These are the two things the customer's backend would
// configure in real production — everything else the demo app handles itself.
const CHICKEN_SCRATCH_BASE_URL = process.env.CHICKEN_SCRATCH_BASE_URL
  ?? 'https://chickenscratch.io';
const CHICKEN_SCRATCH_API_KEY = process.env.CHICKEN_SCRATCH_API_KEY ?? '';
const PORT = parseInt(process.env.PORT ?? '3004', 10);

if (!CHICKEN_SCRATCH_API_KEY) {
  console.warn(
    '[demo-app] CHICKEN_SCRATCH_API_KEY is not set. SDK token issuance will fail. ' +
    'Create an API key in the chickenScratch admin dashboard and set the env var.',
  );
}

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Auth endpoints — a deliberately-simplistic fake auth system. ─────────────

app.post('/demo-api/signup', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }
  try {
    const user = await createUser(email, password);
    const session = createSession(user.id);
    res.status(201).json({
      userId: user.id,
      email: user.email,
      sessionToken: session.token,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/demo-api/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await findUserByEmail(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const session = createSession(user.id);
  res.json({
    userId: user.id,
    email: user.email,
    sessionToken: session.token,
  });
});

app.post('/demo-api/logout', (req, res) => {
  const token = req.body?.sessionToken;
  if (token) deleteSession(token);
  res.json({ success: true });
});

app.get('/demo-api/me', async (req, res) => {
  const auth = req.header('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const session = findSession(token);
  if (!session) return res.status(401).json({ error: 'Not signed in.' });
  const user = await findUserById(session.userId);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ userId: user.id, email: user.email, recoveryHint: user.recoveryHint });
});

// ── Recovery endpoints — the reason the demo app exists. ─────────────────────

/**
 * Lookup: "I forgot which email I used to sign up." User enters a fragment
 * (e.g. "blair"), we return matching emails (or a list they can pick from).
 * In a real product, this might require additional proof of identity before
 * returning matches; the demo is simpler.
 */
app.post('/demo-api/recovery/lookup', async (req, res) => {
  const { fragment } = req.body ?? {};
  const matches = await findUsersByEmailFragment(fragment ?? '');
  // Don't return passwords or sensitive fields — just enough to let the user
  // pick the right account.
  res.json({
    matches: matches.map(u => ({ userId: u.id, emailMask: maskEmail(u.email) })),
  });
});

/**
 * Called AFTER the chickenScratch SDK returns a successful verify result.
 * The demo app's client passes the userId that was verified; we establish
 * a session. In a real customer's backend, this endpoint would ALSO verify
 * with chickenScratch's backend directly (not trust the client-side pass),
 * but for demo purposes we trust the flow.
 */
app.post('/demo-api/recovery/complete', async (req, res) => {
  const { userId, attestationToken, newPassword } = req.body ?? {};
  if (!userId || !attestationToken) {
    return res.status(400).json({ error: 'userId and attestationToken required.' });
  }
  if (!CHICKEN_SCRATCH_API_KEY) {
    return res.status(500).json({
      error: 'CHICKEN_SCRATCH_API_KEY is not configured on the demo-app server.',
    });
  }

  // Server-to-server attestation check. Fails if the token is forged,
  // expired, or belongs to a different tenant. This is what makes recovery
  // trustworthy — without it, an attacker who controls the browser could
  // just POST here saying "I passed verify!" without actually passing.
  try {
    const response = await fetch(`${CHICKEN_SCRATCH_BASE_URL}/api/v1/attestation/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CHICKEN_SCRATCH_API_KEY,
      },
      body: JSON.stringify({ token: attestationToken }),
    });
    const data = await response.json() as { valid?: boolean; externalUserId?: string; error?: string };
    if (!response.ok || !data.valid) {
      return res.status(401).json({
        error: data.error || 'Attestation token failed validation. Recovery denied.',
      });
    }
    // Cross-check: the attestation must be for the user the client claims.
    // Prevents an attacker from handing us a valid attestation minted for
    // some OTHER user they happen to control.
    if (data.externalUserId !== userId) {
      return res.status(403).json({ error: 'Attestation is for a different user.' });
    }
  } catch (err) {
    return res.status(502).json({
      error: `Failed to validate attestation: ${(err as Error).message}`,
    });
  }

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (newPassword) await updatePassword(userId, newPassword);
  const session = createSession(user.id);
  res.json({
    userId: user.id,
    email: user.email,
    sessionToken: session.token,
  });
});

// ── SDK token proxy — the key piece that mimics real customer integration. ──

/**
 * Customer backends call the chickenScratch /api/v1/sdk-token endpoint with
 * their API key to mint a short-lived token, then hand the token to the
 * frontend. The API key NEVER leaves the customer's server.
 *
 * We require an explicit `purpose` so the frontend has to be deliberate
 * about why it's asking for a token (enroll vs verify) — purely for clarity
 * during demos, since the chickenScratch token itself is purpose-agnostic.
 */
app.post('/demo-api/sdk-token', async (req, res) => {
  const { externalUserId, purpose } = req.body ?? {};
  if (!externalUserId) {
    return res.status(400).json({ error: 'externalUserId required.' });
  }
  if (!CHICKEN_SCRATCH_API_KEY) {
    return res.status(500).json({
      error: 'CHICKEN_SCRATCH_API_KEY is not configured on the demo-app server.',
    });
  }

  try {
    const response = await fetch(`${CHICKEN_SCRATCH_BASE_URL}/api/v1/sdk-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CHICKEN_SCRATCH_API_KEY,
      },
      body: JSON.stringify({ externalUserId }),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json({ ...data, purpose: purpose ?? 'unspecified' });
  } catch (err) {
    res.status(502).json({ error: `Failed to reach chickenScratch: ${(err as Error).message}` });
  }
});

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/demo-api/health', (_req, res) => {
  res.json({
    status: 'ok',
    chickenScratchBaseUrl: CHICKEN_SCRATCH_BASE_URL,
    hasApiKey: Boolean(CHICKEN_SCRATCH_API_KEY),
  });
});

// ── Static frontend ──────────────────────────────────────────────────────────

// In production, the built client sits at ../client relative to dist/server.
// In dev, the Vite dev server serves the client separately on its own port.
const clientDist = path.resolve(__dirname, '../client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA catch-all — any non-API route falls back to index.html so the React
  // router can handle it.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/demo-api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Bootstrap: ensure the demo_users table exists, upsert seed accounts,
// then start listening. Before persistence was added (commit 1371cee),
// this block was just `seedAccounts()` against an in-memory Map — every
// Railway redeploy wiped the Map, orphaning biometric enrollments from
// their emails. Now user records live in Postgres and survive restarts;
// seeding is still done for deterministic test accounts.
async function bootstrap() {
  try {
    await ensureSchema();
    await seedAccounts();
  } catch (err) {
    // Don't fail boot hard on schema/seed errors — the app should still
    // come up and serve its static assets even if DB is temporarily
    // unreachable. API endpoints will surface the error at call time.
    console.error('[demo-app] bootstrap error:', (err as Error).message);
  }

  app.listen(PORT, () => {
    console.log(`[demo-app] listening on http://localhost:${PORT}`);
    console.log(`[demo-app] chickenScratch base URL: ${CHICKEN_SCRATCH_BASE_URL}`);
  });
}

bootstrap();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
