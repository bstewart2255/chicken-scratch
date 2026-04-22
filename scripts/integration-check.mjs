#!/usr/bin/env node

/**
 * chickenScratch integration check.
 *
 * Runs a series of read-only + probing calls against a chickenScratch
 * backend using your tenant API key. Confirms the wiring you'll need for
 * a working integration:
 *
 *   1. Backend reachable (GET /health)
 *   2. API key accepted and can mint SDK tokens (POST /api/v1/sdk-token)
 *   3. Enrollment status endpoint returns the expected shape
 *      (GET /api/v1/enroll/:externalUserId/status)
 *   4. Machine-readable errorCode is returned on expected failures
 *      (POST /api/v1/attestation/verify with a bogus token → 401 +
 *      errorCode INVALID_ATTESTATION)
 *   5. Consent-status endpoint works
 *      (GET /api/v1/consent/:externalUserId)
 *
 * Does NOT enroll or verify real biometrics — those require real stroke
 * data. What this covers is the "am I authenticated, are my errors shaped
 * right" loop that bites first-day integrations. Customers run it once
 * after plugging in their API key; we run it post-deploy as a smoke test.
 *
 * Usage:
 *   node scripts/integration-check.mjs \
 *     --base-url https://chickenscratch.io \
 *     --api-key cs_live_...
 *
 * Exits 0 if every check passes, non-zero if any fail.
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1]]);
    return acc;
  }, []),
);

const BASE_URL = (args['base-url'] ?? process.env.CHICKEN_SCRATCH_BASE_URL ?? '').replace(/\/+$/, '');
const API_KEY = args['api-key'] ?? process.env.CHICKEN_SCRATCH_API_KEY ?? '';
const EXTERNAL_USER_ID = args['user-id'] ?? `integration-check-${Date.now()}`;

if (!BASE_URL || !API_KEY) {
  console.error('Usage: node scripts/integration-check.mjs --base-url <url> --api-key <cs_live_...>');
  console.error('       (or set CHICKEN_SCRATCH_BASE_URL + CHICKEN_SCRATCH_API_KEY env vars)');
  process.exit(2);
}

const checks = [];
let failed = 0;

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  const mark = ok ? '\u2713' : '\u2717';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${mark}\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

async function req(method, path, { body, headers } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nchickenScratch integration check against ${BASE_URL}\n`);

  // 1. Backend reachable
  try {
    const res = await fetch(`${BASE_URL}/health`);
    record('Backend reachable (/health)', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    record('Backend reachable (/health)', false, err.message);
    // If we can't reach the backend at all, there's no point running the rest.
    process.exit(1);
  }

  // 2. API key accepted — mint an SDK token
  {
    const { status, data } = await req('POST', '/api/v1/sdk-token', {
      body: { externalUserId: EXTERNAL_USER_ID },
    });
    const ok = status === 200 && typeof data?.token === 'string' && data.token.startsWith('cs_sdk_');
    record('API key accepted; SDK token issued', ok, ok ? `token ${data.token.slice(0, 16)}\u2026` : `HTTP ${status}: ${data?.error ?? JSON.stringify(data)}`);
  }

  // 3. Enrollment status for a fresh user
  {
    const { status, data } = await req('GET', `/api/v1/enroll/${encodeURIComponent(EXTERNAL_USER_ID)}/status`);
    const ok = status === 200 && typeof data?.enrolled === 'boolean';
    record('Enrollment status endpoint', ok, ok
      ? `enrolled=${data.enrolled}, samples=${data.samplesCollected}/${data.samplesRequired}`
      : `HTTP ${status}: ${data?.error ?? JSON.stringify(data)}`);
  }

  // 4. Attestation-verify returns a well-formed errorCode on bad tokens
  {
    const { status, data } = await req('POST', '/api/v1/attestation/verify', {
      body: { token: 'clearly-not-a-real-token' },
    });
    const ok = status === 401 && data?.errorCode === 'INVALID_ATTESTATION';
    record('Attestation endpoint returns INVALID_ATTESTATION on bogus tokens', ok, ok
      ? 'HTTP 401 + errorCode=INVALID_ATTESTATION'
      : `HTTP ${status}: ${JSON.stringify(data)}`);
  }

  // 5. Consent status endpoint
  {
    const { status, data } = await req('GET', `/api/v1/consent/${encodeURIComponent(EXTERNAL_USER_ID)}`);
    const ok = status === 200 && typeof data?.hasConsented === 'boolean';
    record('Consent status endpoint', ok, ok
      ? `hasConsented=${data.hasConsented}`
      : `HTTP ${status}: ${data?.error ?? JSON.stringify(data)}`);
  }

  // 6. Missing-field error shape
  {
    const { status, data } = await req('POST', '/api/v1/sdk-token', { body: {} });
    const ok = status === 400 && data?.errorCode === 'MISSING_FIELD';
    record('400 errors include errorCode=MISSING_FIELD', ok, ok
      ? 'HTTP 400 + errorCode=MISSING_FIELD'
      : `HTTP ${status}: ${JSON.stringify(data)}`);
  }

  // 7. Bad API key should return UNAUTHORIZED
  {
    const badRes = await fetch(`${BASE_URL}/api/v1/sdk-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'cs_live_definitely_not_real' },
      body: JSON.stringify({ externalUserId: EXTERNAL_USER_ID }),
    });
    const data = await badRes.json().catch(() => null);
    const ok = badRes.status === 401 && data?.errorCode === 'UNAUTHORIZED';
    record('Invalid API keys return errorCode=UNAUTHORIZED', ok, ok
      ? 'HTTP 401 + errorCode=UNAUTHORIZED'
      : `HTTP ${badRes.status}: ${JSON.stringify(data)}`);
  }

  console.log('');
  if (failed > 0) {
    console.log(`\x1b[31m${failed} check(s) failed.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll ${checks.length} checks passed.\x1b[0m`);
  }
}

main().catch(err => {
  console.error('Integration check crashed:', err);
  process.exit(2);
});
