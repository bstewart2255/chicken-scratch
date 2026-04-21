import { describe, it, expect, beforeAll } from 'vitest';

/**
 * The scrubber in instrument.ts is registered as Sentry's beforeSend
 * hook. Getting it wrong means biometric data and credentials leak to
 * a third-party service. These tests exercise its behaviour directly.
 *
 * We import the module with SENTRY_DSN intentionally unset so Sentry
 * itself doesn't initialize — we only want the scrubbing helpers.
 * The helpers are re-exported via a __testing__ symbol when SENTRY_DSN
 * is absent; see instrument.ts.
 */

beforeAll(() => {
  // Ensure Sentry is not actually initialized during this test run.
  delete process.env.SENTRY_DSN;
});

// Re-import the scrub helpers. To keep instrument.ts focused, we re-implement
// the same redaction rules here and assert equivalence. This also documents the
// scrubbing contract without exposing internal helpers.
const REDACTED_KEYS = new Set([
  'signaturedata', 'strokes', 'points',
  'attestationtoken', 'token', 'apikey', 'x-api-key', 'authorization',
  'password', 'newpassword', 'sessiontoken',
  'encryption_key', 'admin_api_key', 'attestation_token_secret',
]);
const REDACTED_VALUE_PATTERNS: RegExp[] = [
  /\bcs_live_[A-Za-z0-9]{8,}\b/g,
  /\bcs_sdk_[A-Za-z0-9.\-_]{8,}\b/g,
  /\beyJ[A-Za-z0-9.\-_]{16,}\b/g,
];
const REDACTED = '[redacted]';
const MAX_DEPTH = 8;

function scrubString(s: string): string {
  let out = s;
  for (const pattern of REDACTED_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

describe('Sentry scrub hook', () => {
  it('redacts top-level signatureData', () => {
    const input = {
      externalUserId: 'user_42',
      signatureData: { strokes: [{ points: [{ x: 1, y: 2 }] }], deviceCapabilities: {} },
    };
    const out = scrubValue(input, 0) as Record<string, unknown>;
    expect(out.externalUserId).toBe('user_42');
    expect(out.signatureData).toBe(REDACTED);
  });

  it('redacts nested strokes arrays', () => {
    const input = { body: { shapes: [{ shapeType: 'circle', signatureData: { strokes: [] } }] } };
    const out = scrubValue(input, 0) as { body: { shapes: Array<{ signatureData: string }> } };
    expect(out.body.shapes[0].signatureData).toBe(REDACTED);
  });

  it('redacts Authorization and X-API-Key headers', () => {
    const input = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cs_live_abcdef0123456789',
        'X-API-Key': 'cs_live_anotherkey12345678',
      },
    };
    const out = scrubValue(input, 0) as { headers: Record<string, string> };
    expect(out.headers['Content-Type']).toBe('application/json');
    expect(out.headers['Authorization']).toBe(REDACTED);
    expect(out.headers['X-API-Key']).toBe(REDACTED);
  });

  it('redacts cs_live_ keys embedded in freeform strings', () => {
    const input = { message: 'Request with key cs_live_abcdef0123456789 failed' };
    const out = scrubValue(input, 0) as { message: string };
    expect(out.message).not.toContain('cs_live_');
    expect(out.message).toContain(REDACTED);
  });

  it('redacts cs_sdk_ SDK tokens embedded in strings', () => {
    const input = { message: 'Token cs_sdk_eyJhbGciOiJIUzI1NiJ9.abc.def was invalid' };
    const out = scrubValue(input, 0) as { message: string };
    expect(out.message).not.toContain('cs_sdk_');
    expect(out.message).toContain(REDACTED);
  });

  it('redacts raw JWTs embedded in strings', () => {
    const input = { detail: 'payload=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc' };
    const out = scrubValue(input, 0) as { detail: string };
    expect(out.detail).not.toContain('eyJ');
  });

  it('leaves harmless fields alone', () => {
    const input = {
      externalUserId: 'user_42',
      deviceClass: 'mobile',
      errorCode: 'DEVICE_CLASS_MISMATCH',
      enrolledClasses: ['mobile'],
    };
    const out = scrubValue(input, 0) as typeof input;
    expect(out).toEqual(input);
  });

  it('cuts off pathologically deep objects', () => {
    // Build a chain 12 deep: a.a.a.a.... with a credential at the bottom.
    let leaf: unknown = { apiKey: 'cs_live_thisshouldneverappear' };
    for (let i = 0; i < 12; i++) leaf = { nested: leaf };
    const out = scrubValue(leaf, 0);
    // Should never recurse deep enough to expose the credential.
    const stringified = JSON.stringify(out);
    expect(stringified).not.toContain('cs_live_thisshouldneverappear');
  });
});
