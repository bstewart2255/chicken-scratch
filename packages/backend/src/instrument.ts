/**
 * Sentry initialization — must be imported BEFORE any other application
 * code so OpenTelemetry instrumentation can hook into module loading.
 * That's why this lives as its own entry module and is the first import
 * in index.ts.
 *
 * Sentry is opt-in via the SENTRY_DSN env var. If unset (dev, local
 * docker, CI), no init happens and the rest of the app is untouched.
 *
 * Data scrubbing is aggressive by design. This service handles biometric
 * stroke data, API keys, SDK tokens, and attestation tokens — none of
 * which should ever leave the chickenScratch perimeter. `beforeSend`
 * recursively redacts known-sensitive keys and any string that matches
 * our credential prefixes. Better to over-redact and lose a little stack-
 * trace context than to under-redact and ship biometric payloads to a
 * third-party error tracker.
 */

import 'dotenv/config';
import * as Sentry from '@sentry/node';

// Keys whose *values* are sensitive, wherever they appear in an event
// (body, query, breadcrumbs, extra). Matched case-insensitively.
const REDACTED_KEYS = new Set([
  'signaturedata',     // raw stroke payload
  'strokes',           // stroke array
  'points',            // stroke point array — sometimes nested
  'attestationtoken',  // signed verify receipt
  'token',             // SDK tokens, session tokens, misc JWTs
  'apikey',            // API keys
  'x-api-key',         // same, as a header
  'authorization',     // Bearer headers
  'password',          // defense in depth (we don't handle passwords, but customers' request bodies might)
  'newpassword',
  'sessiontoken',
  'encryption_key',
  'admin_api_key',
  'attestation_token_secret',
]);

// String values matching these patterns are redacted regardless of key.
const REDACTED_VALUE_PATTERNS: RegExp[] = [
  /\bcs_live_[A-Za-z0-9]{8,}\b/g,     // API keys
  /\bcs_sdk_[A-Za-z0-9.\-_]{8,}\b/g,  // SDK tokens (JWTs after the prefix)
  /\beyJ[A-Za-z0-9.\-_]{16,}\b/g,     // raw JWTs (the eyJ prefix is base64 of '{"')
];

const REDACTED = '[redacted]';
const MAX_DEPTH = 8;  // stop walking pathological nesting (shouldn't happen, but belt-and-braces)

function scrubString(s: string): string {
  let out = s;
  for (const pattern of REDACTED_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map(v => scrubValue(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubValue(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Separate environments so staging errors don't pollute prod views.
    environment: process.env.NODE_ENV ?? 'development',
    // Sample perf data at a conservative rate. We want traces on real
    // issues, not on every health check. Adjust based on cost signal.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Never let Sentry auto-attach PII like IPs or cookies.
    sendDefaultPii: false,
    beforeSend(event) {
      // Recursively scrub the event. Mutates in place via replacement.
      if (event.request) {
        event.request = scrubValue(event.request, 0) as typeof event.request;
      }
      if (event.extra) {
        event.extra = scrubValue(event.extra, 0) as typeof event.extra;
      }
      if (event.contexts) {
        event.contexts = scrubValue(event.contexts, 0) as typeof event.contexts;
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => ({
          ...b,
          data: b.data ? (scrubValue(b.data, 0) as typeof b.data) : b.data,
          message: b.message ? scrubString(b.message) : b.message,
        }));
      }
      if (event.message) {
        event.message = scrubString(event.message);
      }
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrubString(ex.value);
        }
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Drop /health breadcrumbs — they're Railway's liveness checks,
      // they fire every few seconds, and they add nothing to debugging.
      if (breadcrumb.category === 'http' && breadcrumb.data?.url?.toString().endsWith('/health')) {
        return null;
      }
      return breadcrumb;
    },
  });
  console.log(`[sentry] Enabled (env=${process.env.NODE_ENV ?? 'development'})`);
} else if (process.env.NODE_ENV === 'production') {
  console.warn('[sentry] SENTRY_DSN not set in production — error tracking disabled.');
}
