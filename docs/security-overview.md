# Security Overview

Working document. "Known Vulnerabilities" below is the outstanding-items list — knock items off as they ship, move them to "Security Controls in Place" with a commit hash. Before pilot launch, the Critical and High sections should be empty.

---

## Known Vulnerabilities (working set)

### Critical

1. **Open diagnostics oracle.** `/api/diagnostics/*` is mounted with no auth ([app.ts:145](../packages/backend/src/app.ts#L145)). Exposes every user's attempts, scores, threshold, breakdowns, per-shape results, device fingerprint, baselines (`avgFeatures`, `stdDevs`), and enrollment samples. An unauthenticated caller can:
   - List all users (`GET /api/diagnostics/users`)
   - Read full attempt history and score distributions (`/users/:u/attempts`, `/users/:u/stats`)
   - Read the mathematical description of any user's signature (`/users/:u/baseline`, `/users/:u/enrollment-samples`)
   - **Run the forgery simulator against any user** (`POST /users/:u/forgery-simulation`) and get trial-by-trial pass/fail per skill level — a tunable false-accept-rate oracle.
   - **Fix:** shared-secret middleware on the `/api/diagnostics/*` route group (`X-Admin-Key` header checked against a `DIAGNOSTICS_ADMIN_KEY` env var). ~1–2 hours incl. frontend dashboard plumbing.

### High

2. **Synthetic strokes not rejected.** Naturalness heuristics exist in [diagnostic-flags.ts](../packages/backend/src/features/extraction/diagnostic-flags.ts) (speed coefficient-of-variation, timing regularity, behavioral authenticity) but are **informational only** — they don't gate enrollment or verify. A remote attacker who generates stroke JSON programmatically (no finger or stylus ever touches a screen) will not be auto-rejected. Paired with the diagnostics oracle above, this is the realistic remote attack path.
   - **Fix:** promote one or more signals to a hard gate with thresholds tuned from real data. Should be preceded by calibration on genuine vs. synthetic distributions.

3. **Client-controlled device class.** Server trusts `deviceCapabilities.inputMethod` from the client payload ([device-class.ts:18](../packages/backend/src/utils/device-class.ts#L18)) and uses it to select which baseline to compare against. A forger can declare whichever class (mobile/desktop) makes their spoof easier. Device-class *mismatch* is rejected, but device-class *identity* is unverified.
   - **Fix:** cross-check against `PointerEvent.pointerType` at draw time where available; treat mismatch between declared and observed as suspicious.

### Medium

4. **SDK token reuse window.** SDK JWTs are valid for 15 min, stateless, with no revocation list ([sdk-token.service.ts:3](../packages/backend/src/services/sdk-token.service.ts#L3)). A leaked token (XSS in customer app, browser extension, shared device) is a 15-minute free pass until expiry. Rotating the tenant's API key does not invalidate in-flight SDK tokens.
   - **Fix:** shorten TTL (1–2 min) with refresh, or add a server-side revocation list keyed on `jti`.

5. **In-memory state is single-instance only.** Rate-limit counters ([rate-limit.ts:14](../packages/backend/src/middleware/rate-limit.ts#L14)) and challenge sessions are process-local. Horizontal scaling (multiple Railway replicas) breaks both the rate cap and one-time-use challenge guarantees.
   - **Fix:** move counters + challenge state to Redis or Postgres before scaling beyond one instance.

6. **No HMAC request signing.** Payload tampering in transit is possible if TLS is stripped at any proxy layer the customer runs. Listed P1 in the pilot checklist.
   - **Fix:** customer-API-secret HMAC header; server validates body hash.

7. **No per-API-key rate limit.** The limiter keys on tenant or IP, not individual keys. A single compromised key inside a tenant can exhaust that tenant's entire verify budget.
   - **Fix:** add per-key counter alongside the existing tenant/IP counter.

### Lower

8. **Raw strokes stored (encrypted) for the forgery simulator.** Useful for internal tuning, but a future breach target. Decide pre-pilot whether to discard raw points post-extraction for customer data, keeping them only for our own test users.

9. **Enrollment-time social engineering.** Whoever enrolls first *becomes* that user. An attacker who phishes the enrollment link before the legitimate user can register their own signature and invert the forger/legitimate relationship. Defense is customer-side identity verification.
   - **Fix:** document clearly in integration guides; the platform itself cannot close this.

10. **Stolen unlocked device.** Nothing in chickenScratch defends against "phone is unlocked, attacker is at the verify screen." Falls on the customer's fallback/MFA design.
    - **Fix:** integrator-guidance documentation item.

11. **Fingerprint match is diagnostic only.** Client-computed device fingerprint is compared to enrollment ([auth.service.ts:248](../packages/backend/src/services/auth.service.ts#L248)) but mismatch does not gate auth. Low priority — fingerprinting is inherently spoofable and hardening this adds little absolute security.

---

## Security Controls in Place

### Replay & session integrity

- **One-time challenge tokens**, 5-minute TTL, server-minted with a randomized shape order; submitted shape sequence must match exactly and `session.status` is flipped to `completed` on use ([session.service.ts:44–136](../packages/backend/src/services/session.service.ts#L44)). Replay of a prior verify payload fails.
- **Shape-order randomization** is enforced server-side — the client cannot pre-commit to a shape sequence, so pre-captured strokes cannot be reordered to match.
- **Fresh-timestamp requirement** on verify requests.

### Authorization & tenant isolation

- **API keys stored as SHA-256 hashes** ([api-key.repo.ts:18](../packages/backend/src/db/repositories/api-key.repo.ts#L18)); plaintext never hits disk. Format: `cs_live_` prefix + 64 hex chars (32 random bytes).
- **Tenant-scoped user keying** — internal username format `t:{tenantId}:{externalUserId}` ([tenant.repo.ts:163](../packages/backend/src/db/repositories/tenant.repo.ts#L163)). All user lookups go through `resolveUser()` ([tenant-api.routes.ts:78](../packages/backend/src/routes/tenant-api.routes.ts#L78)) — no cross-tenant reads possible via the public API.
- **Attestation tokens are tenant-bound**; mismatch rejected with 403 ([tenant-api.routes.ts:512](../packages/backend/src/routes/tenant-api.routes.ts#L512)).
- **Key rotation + deactivation supported** via `rotateApiKey()`.

### Biometric data handling

- **AES-256-GCM encryption at rest** on every biometric field: `stroke_data`, `features`, `ml_features`, `avg_features`, `feature_std_devs`, `biometric_features`, `shape_features`, `avg_biometric_features`, `avg_shape_features` ([utils/crypto.ts](../packages/backend/src/utils/crypto.ts) + repo layer). Non-biometric metadata (device capabilities, auth-attempt breakdowns) intentionally plaintext for observability.
- **`enc:` prefix detection** gives transparent plaintext read-through for backwards compatibility during rollout.
- **`ENCRYPTION_KEY` env-var** (64 hex chars); startup warning if unset so dev-mode plaintext is visible.

### Consent & data rights

- **Consent gate before enrollment** — `/api/v1/consent` POST/GET/DELETE, enforced in enroll routes ([tenant-api.routes.ts:200](../packages/backend/src/routes/tenant-api.routes.ts#L200)).
- **Withdrawal triggers immediate biometric-data deletion** ([consent.service.ts:98](../packages/backend/src/services/consent.service.ts#L98)).
- **User-deletion endpoint implemented** — `DELETE /api/v1/users/:externalUserId` ([tenant-api.routes.ts:696](../packages/backend/src/routes/tenant-api.routes.ts#L696)). Not a stub.
- **Privacy policy** published at [chickenscratch.io/privacy](https://chickenscratch.io/privacy).

### Abuse resistance

- **Rate limiting** — `verifyRateLimit` and `enrollRateLimit` middleware, fixed-window, keyed by tenant or IP ([rate-limit.ts:58](../packages/backend/src/middleware/rate-limit.ts#L58)).
- **Lockout** — failed-attempts-in-window counter triggers a 423 response with cool-down ([lockout.service.ts:18](../packages/backend/src/services/lockout.service.ts#L18), [tenant-api.routes.ts:370](../packages/backend/src/routes/tenant-api.routes.ts#L370)).
- **Score-leakage lockdown** — public verify endpoints (`/api/verify`, `/api/verify/full`, `/api/v1/verify`) return only `success` / `authenticated` / `errorCode`. Scores, thresholds, and breakdowns never leave the server via the auth path.
- **Enrollment quality gates** — samples with too few points, too-short duration, or bounding box smaller than the threshold are rejected ([enrollment.service.ts:217](../packages/backend/src/services/enrollment.service.ts#L217)). Trivial gestures ("X", single dot) fail the duration check.
- **Device-class mismatch rejected** — enrolled class must match verify class ([auth.service.ts:156](../packages/backend/src/services/auth.service.ts#L156)). Error surfaces the set of enrolled classes for UX.

---

## How to use this doc

- When a vulnerability is fixed, move the entry to the matching "Security Controls in Place" subsection and append the commit hash in parentheses.
- Add new findings to the working set as they surface (threat-model passes, user reports, pen-test results).
- Review before each pilot customer onboarding: Critical and High sections must be empty.
- Sibling docs: [scoring-tuning-log.md](./scoring-tuning-log.md) (empirical scoring changes), [scoring-research.md](./scoring-research.md) (field best practice).
