import { Router, type Request } from 'express';
import { requireApiKey } from '../middleware/api-key-auth.js';
import { sdkTokenAuth } from '../middleware/sdk-token-auth.js';
import { validate } from '../middleware/validate.js';
import { verifyRateLimit, enrollRateLimit } from '../middleware/rate-limit.js';
import { TenantEnrollRequestSchema, TenantShapeEnrollRequestSchema, TenantVerifyFullRequestSchema, TenantChallengeRequestSchema } from './tenant-api.schemas.js';
import { enrollSample, enrollShape, getEnrollmentStatus } from '../services/enrollment.service.js';
import { verifyFull } from '../services/auth.service.js';
import { createChallenge } from '../services/session.service.js';
import { recordConsent, getConsentStatus, withdrawConsent, checkConsentGate, deleteUser } from '../services/consent.service.js';
import { checkLockout, lockoutMessage } from '../services/lockout.service.js';
import { createSdkToken } from '../services/sdk-token.service.js';
import { createAttestationToken, verifyAttestationToken } from '../services/attestation.service.js';
import type { DeviceClass, TenantApiErrorCode } from '@chicken-scratch/shared';

/**
 * Shape every tenant-API error response consistently: a human-readable
 * `error` string + a machine-readable `errorCode`. Customers branch on
 * `errorCode`; the message text may change without notice.
 */
function errorBody(code: TenantApiErrorCode, message: string, extra?: Record<string, unknown>) {
  return { success: false, error: message, errorCode: code, ...(extra ?? {}) };
}
import * as tenantRepo from '../db/repositories/tenant.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';
import { CURRENT_POLICY_VERSION } from '@chicken-scratch/shared';

const router = Router();

// All /api/v1/ routes accept either:
// 1. API key (X-API-Key or Authorization: Bearer cs_live_...) — for server-to-server
// 2. SDK token (Authorization: Bearer cs_sdk_...) — for browser SDK
// SDK token auth runs first; if not an SDK token, falls through to API key auth
router.use('/api/v1', sdkTokenAuth, (req, res, next) => {
  // If SDK token already authenticated, skip API key check
  if (req.tenant) return next();
  // Otherwise, require API key
  requireApiKey(req, res, next);
});

// ─── SDK Token ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/sdk-token
 * Issue a short-lived JWT for browser SDK use.
 * Called by the customer's BACKEND (authenticated with API key, not from browser).
 * The token is scoped to a specific tenant + externalUserId and expires in 15 minutes.
 */
router.post('/api/v1/sdk-token', async (req, res, next) => {
  try {
    const tenant = req.tenant!;
    const { externalUserId } = req.body;

    if (!externalUserId || typeof externalUserId !== 'string') {
      res.status(400).json(errorBody('MISSING_FIELD', 'externalUserId is required.'));
      return;
    }

    const result = createSdkToken(tenant.id, externalUserId);

    res.json({
      success: true,
      token: `cs_sdk_${result.token}`, // Prefix so middleware can distinguish from API keys
      externalUserId,
      expiresIn: result.expiresIn,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Resolve externalUserId to internal username.
 * Creates user + mapping if they don't exist yet.
 */
async function resolveUser(tenantId: string, externalUserId: string, createIfMissing = false) {
  const internalUsername = tenantRepo.toInternalUsername(tenantId, externalUserId);
  const mapping = await tenantRepo.findTenantUser(tenantId, externalUserId);
  if (mapping) {
    return { username: internalUsername, userId: mapping.user_id, exists: true };
  }
  if (!createIfMissing) {
    return { username: internalUsername, userId: null, exists: false };
  }
  const user = await userRepo.createUser(internalUsername);
  await tenantRepo.createTenantUser(tenantId, externalUserId, user.id);
  return { username: internalUsername, userId: user.id, exists: true };
}

// ─── Consent ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/consent
 * Record explicit biometric data consent for a user.
 * Must be called before enrollment. Required for BIPA/GDPR compliance.
 */
router.post('/api/v1/consent', async (req, res, next) => {
  try {
    const { externalUserId, policyVersion } = req.body;
    const tenant = req.tenant!;

    if (!externalUserId || typeof externalUserId !== 'string') {
      res.status(400).json(errorBody('MISSING_FIELD', 'externalUserId is required.'));
      return;
    }

    const version = policyVersion ?? CURRENT_POLICY_VERSION;
    const ip = req.ip ?? req.headers['x-forwarded-for'] as string ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await recordConsent(tenant.id, externalUserId, version, ip, userAgent);
    res.json({
      success: true,
      externalUserId,
      policyVersion: version,
      consentedAt: result.consentedAt,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/consent/:externalUserId
 * Check a user's current consent status.
 */
router.get('/api/v1/consent/:externalUserId', async (req, res, next) => {
  try {
    const tenant = req.tenant!;
    const { externalUserId } = req.params;

    const status = await getConsentStatus(tenant.id, externalUserId);
    res.json({
      externalUserId,
      hasConsented: status.hasConsented,
      policyVersion: status.policyVersion,
      consentedAt: status.consentedAt,
      isCurrentVersion: status.isCurrentVersion,
      currentPolicyVersion: CURRENT_POLICY_VERSION,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/consent/:externalUserId
 * Withdraw biometric data consent (GDPR / BIPA right to erasure trigger).
 */
router.delete('/api/v1/consent/:externalUserId', async (req, res, next) => {
  try {
    const tenant = req.tenant!;
    const { externalUserId } = req.params;

    const result = await withdrawConsent(tenant.id, externalUserId);
    if (!result.success) {
      res.status(404).json(errorBody('USER_NOT_FOUND', result.message, { externalUserId }));
      return;
    }
    res.status(200).json({
      success: true,
      externalUserId,
      message: result.message,
      deletionSummary: result.deletionSummary,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Enrollment ──────────────────────────────────────────────────────────────

router.post('/api/v1/enroll', enrollRateLimit, validate(TenantEnrollRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId, signatureData, skipRecentVerify } = req.body;
    const tenant = req.tenant!;

    // Consent gate — block enrollment if user hasn't consented
    const consentError = await checkConsentGate(tenant.id, externalUserId);
    if (consentError) {
      res.status(403).json(errorBody('CONSENT_REQUIRED', consentError));
      return;
    }

    const { username } = await resolveUser(tenant.id, externalUserId, true);
    // skipRecentVerify opt-out: customer attests they've authenticated the user
    // via their own means (password + MFA + etc.) and is bypassing our biometric
    // add-device gate. Customer takes responsibility for that authentication.
    const result = await enrollSample(username, signatureData, false, {
      skipRecentVerify: skipRecentVerify === true,
    });

    // Map service-layer error codes to HTTP status. Gate failures return 403
    // (security rejection); quality / already-enrolled return 400.
    const status = result.success
      ? 200
      : result.errorCode === 'RECENT_VERIFY_REQUIRED'
      ? 403
      : 400;

    // Inferred error code if the service didn't set one (quality-gate rejections
    // fall through as generic success: false without a code).
    const errorCode: TenantApiErrorCode | undefined = result.success
      ? undefined
      : (result.errorCode as TenantApiErrorCode | undefined)
        ?? (result.message.toLowerCase().includes('sample') ? 'QUALITY_GATE_FAILED' : 'INVALID_REQUEST');

    res.status(status).json({
      success: result.success,
      externalUserId,
      sampleNumber: result.sampleNumber,
      samplesRemaining: result.samplesRemaining,
      enrolled: result.enrolled,
      message: result.message,
      ...(errorCode ? { errorCode } : {}),
      ...(result.deviceClass ? { deviceClass: result.deviceClass } : {}),
      ...(result.enrolledClasses ? { enrolledClasses: result.enrolledClasses } : {}),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/v1/enroll/shape', enrollRateLimit, validate(TenantShapeEnrollRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId, shapeType, signatureData } = req.body;
    const tenant = req.tenant!;

    // Consent gate
    const consentError = await checkConsentGate(tenant.id, externalUserId);
    if (consentError) {
      res.status(403).json(errorBody('CONSENT_REQUIRED', consentError));
      return;
    }

    const { username, exists } = await resolveUser(tenant.id, externalUserId);
    if (!exists) {
      res.status(404).json(errorBody('USER_NOT_FOUND', 'User not found. Enroll signature first.'));
      return;
    }

    const result = await enrollShape(username, shapeType, signatureData);
    if (!result.success) {
      res.status(400).json(errorBody(
        'QUALITY_GATE_FAILED',
        result.message,
        { externalUserId },
      ));
      return;
    }
    res.status(200).json({
      success: true,
      externalUserId,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/v1/enroll/:externalUserId/status', async (req, res, next) => {
  try {
    const tenant = req.tenant!;
    const externalUserId = req.params.externalUserId;
    const internalUsername = tenantRepo.toInternalUsername(tenant.id, externalUserId);

    const status = await getEnrollmentStatus(internalUsername);

    res.json({
      externalUserId,
      enrolled: status.enrolled,
      samplesCollected: status.samplesCollected,
      samplesRequired: status.samplesRequired,
      shapesEnrolled: status.shapesEnrolled,
      shapesRequired: status.shapesRequired,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Verification ─────────────────────────────────────────────────────────────

router.post('/api/v1/challenge', validate(TenantChallengeRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId } = req.body;
    const tenant = req.tenant!;

    const { exists } = await resolveUser(tenant.id, externalUserId);
    if (!exists) {
      res.status(404).json(errorBody('USER_NOT_FOUND', 'User not found.'));
      return;
    }

    const internalUsername = tenantRepo.toInternalUsername(tenant.id, externalUserId);
    const challenge = await createChallenge(internalUsername);

    res.json({
      challengeId: challenge.challengeId,
      shapeOrder: challenge.shapeOrder,
      expiresAt: challenge.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/v1/verify', verifyRateLimit, validate(TenantVerifyFullRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId, signatureData, shapes, challengeId, durationMs, stepDurations } = req.body;
    const tenant = req.tenant!;

    const { username, userId, exists } = await resolveUser(tenant.id, externalUserId);
    if (!exists || !userId) {
      res.status(404).json(errorBody('USER_NOT_FOUND', 'User not found.'));
      return;
    }

    // Lockout check — must happen before running verification
    const lockout = await checkLockout(userId);
    if (lockout.locked) {
      res.status(423).json(errorBody('LOCKED_OUT', lockoutMessage(lockout), {
        lockedUntil: lockout.lockedUntil,
        retryAfterSeconds: lockout.retryAfterSeconds,
      }));
      return;
    }

    const result = await verifyFull(
      username,
      signatureData,
      shapes,
      challengeId,
      (durationMs || stepDurations) ? { durationMs, stepDurations } : undefined,
    );

    // On successful verify, mint an attestation token the customer's backend
    // can validate server-to-server via POST /api/v1/attestation/verify.
    // Without this, the customer's backend has no way to prove the browser
    // really passed verify (vs. a malicious client lying). Short-lived
    // (5 min) and tenant-scoped so it can't be reused across tenants.
    let attestationToken: string | undefined;
    if (result.authenticated && result.deviceClass) {
      const token = createAttestationToken(
        tenant.id,
        externalUserId,
        result.deviceClass as DeviceClass,
      );
      attestationToken = token.token;
    }

    // Only return pass/fail — never expose scores. Exceptions intentionally
    // exposed: errorCode + enrolledClasses (so clients can render "switch
    // device" UI) and attestationToken (for the customer's backend to
    // validate server-to-server).
    res.json({
      success: result.success,
      authenticated: result.authenticated,
      message: result.authenticated
        ? 'Authentication successful.'
        : result.message || 'Authentication failed.',
      ...(attestationToken ? { attestationToken } : {}),
      ...(result.errorCode ? { errorCode: result.errorCode as TenantApiErrorCode } : {}),
      ...(result.enrolledClasses ? { enrolledClasses: result.enrolledClasses } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Attestation ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/attestation/verify
 *
 * Validate an attestation token returned by /api/v1/verify. Called by the
 * customer's backend as the last step of a recovery (or step-up) flow, before
 * any privileged action is taken: the customer hands the token they received
 * from the browser, chickenScratch validates it, and returns the claims.
 *
 * This is the server-to-server check that makes the recovery flow trustworthy:
 * without it, the customer's backend has no way to distinguish "the browser
 * really passed verify" from "the browser is lying." With it, the customer
 * sees a signed, tenant-bound, unexpired attestation that explicitly names
 * the user who was verified.
 *
 * Requires API-key auth (intentionally NOT callable from SDK tokens — an SDK
 * token is browser-side, and we don't want browser code validating its own
 * attestations).
 */
router.post('/api/v1/attestation/verify', async (req, res, next) => {
  try {
    const tenant = req.tenant!;

    // SDK-token auth is not sufficient here. This endpoint is for the
    // customer's backend, not the browser. If the caller came in via an SDK
    // token (short-lived, browser-scoped), reject.
    // sdkTokenAuth middleware stashes sdkExternalUserId on the request when
    // authentication came from an SDK token; if absent, it was API-key auth.
    if ((req as Request & { sdkExternalUserId?: string }).sdkExternalUserId !== undefined) {
      res.status(403).json(errorBody(
        'FORBIDDEN',
        'Attestation verification requires an API key, not an SDK token. Call this from your backend.',
      ));
      return;
    }

    const { token } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      res.status(400).json(errorBody('MISSING_FIELD', 'token is required.'));
      return;
    }

    const attestation = verifyAttestationToken(token);
    if (!attestation) {
      res.status(401).json({
        valid: false,
        error: 'Attestation token is invalid or expired.',
        errorCode: 'INVALID_ATTESTATION' satisfies TenantApiErrorCode,
      });
      return;
    }

    // Tenant binding: an attestation minted for tenant A cannot be used to
    // claim a verification in tenant B's context. Reject with 403.
    if (attestation.tenantId !== tenant.id) {
      res.status(403).json({
        valid: false,
        error: 'Attestation token does not belong to this tenant.',
        errorCode: 'ATTESTATION_TENANT_MISMATCH' satisfies TenantApiErrorCode,
      });
      return;
    }

    res.json({
      valid: true,
      externalUserId: attestation.externalUserId,
      deviceClass: attestation.deviceClass,
      verifiedAt: attestation.verifiedAt.toISOString(),
      expiresAt: attestation.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── User management ──────────────────────────────────────────────────────────

router.delete('/api/v1/users/:externalUserId', async (req, res, next) => {
  try {
    const tenant = req.tenant!;
    const externalUserId = req.params.externalUserId;

    const result = await deleteUser(tenant.id, externalUserId);

    if (!result.success) {
      res.status(404).json(errorBody('USER_NOT_FOUND', result.message));
      return;
    }

    res.json({
      success: true,
      externalUserId,
      message: result.message,
      deletionSummary: result.deletionSummary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
