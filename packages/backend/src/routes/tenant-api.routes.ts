import { Router } from 'express';
import { requireApiKey } from '../middleware/api-key-auth.js';
import { validate } from '../middleware/validate.js';
import { TenantEnrollRequestSchema, TenantShapeEnrollRequestSchema, TenantVerifyFullRequestSchema, TenantChallengeRequestSchema } from './tenant-api.schemas.js';
import { enrollSample, enrollShape, getEnrollmentStatus } from '../services/enrollment.service.js';
import { verifyFull } from '../services/auth.service.js';
import { createChallenge } from '../services/session.service.js';
import * as tenantRepo from '../db/repositories/tenant.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';

const router = Router();

// All /api/v1/ routes require API key
router.use('/api/v1', requireApiKey);

/**
 * Resolve externalUserId to internal username.
 * Creates user + mapping if they don't exist yet (enrollment flow).
 */
async function resolveUser(tenantId: string, externalUserId: string, createIfMissing: boolean = false) {
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

// --- Enrollment ---

router.post('/api/v1/enroll', validate(TenantEnrollRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId, signatureData } = req.body;
    const tenant = req.tenant!;

    const { username } = await resolveUser(tenant.id, externalUserId, true);
    const result = await enrollSample(username, signatureData);

    res.status(result.success ? 200 : 400).json({
      success: result.success,
      externalUserId,
      sampleNumber: result.sampleNumber,
      samplesRemaining: result.samplesRemaining,
      enrolled: result.enrolled,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/v1/enroll/shape', validate(TenantShapeEnrollRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId, shapeType, signatureData } = req.body;
    const tenant = req.tenant!;

    const { username, exists } = await resolveUser(tenant.id, externalUserId);
    if (!exists) {
      res.status(404).json({ success: false, error: 'User not found. Enroll signature first.' });
      return;
    }

    const result = await enrollShape(username, shapeType, signatureData);
    res.status(result.success ? 200 : 400).json({
      success: result.success,
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

// --- Verification ---

router.post('/api/v1/challenge', validate(TenantChallengeRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId } = req.body;
    const tenant = req.tenant!;

    const { exists } = await resolveUser(tenant.id, externalUserId);
    if (!exists) {
      res.status(404).json({ success: false, error: 'User not found.' });
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

router.post('/api/v1/verify', validate(TenantVerifyFullRequestSchema), async (req, res, next) => {
  try {
    const { externalUserId, signatureData, shapes, challengeId, durationMs, stepDurations } = req.body;
    const tenant = req.tenant!;

    const { username, exists } = await resolveUser(tenant.id, externalUserId);
    if (!exists) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const result = await verifyFull(
      username,
      signatureData,
      shapes,
      challengeId,
      (durationMs || stepDurations) ? { durationMs, stepDurations } : undefined,
    );

    // Only return pass/fail — never expose scores
    res.json({
      success: result.success,
      authenticated: result.authenticated,
      message: result.authenticated ? 'Authentication successful.' : 'Authentication failed.',
    });
  } catch (err) {
    next(err);
  }
});

// --- User management ---

router.delete('/api/v1/users/:externalUserId', async (req, res, next) => {
  try {
    const tenant = req.tenant!;
    const externalUserId = req.params.externalUserId;

    const mapping = await tenantRepo.findTenantUser(tenant.id, externalUserId);
    if (!mapping) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    // TODO: Implement full user deletion (biometric data, baselines, attempts)
    res.status(501).json({
      success: false,
      error: 'User deletion not yet implemented. Required for BIPA/GDPR compliance.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
