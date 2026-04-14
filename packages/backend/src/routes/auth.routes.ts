import { Router } from 'express';
import { VerifyRequestSchema, FullVerifyRequestSchema } from '@chicken-scratch/shared';
import { validate } from '../middleware/validate.js';
import { verifySignature, verifyFull } from '../services/auth.service.js';

const router = Router();

router.post('/api/verify', validate(VerifyRequestSchema), async (req, res, next) => {
  try {
    const { username, signatureData } = req.body;
    const result = await verifySignature(username, signatureData);

    // Only return pass/fail — never expose scores to the client
    res.json({
      success: result.success,
      authenticated: result.authenticated,
      message: result.authenticated ? 'Authentication successful.' : 'Authentication failed.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/verify/full', validate(FullVerifyRequestSchema), async (req, res, next) => {
  try {
    const { username, signatureData, shapes, challengeId, durationMs, stepDurations } = req.body;
    const result = await verifyFull(username, signatureData, shapes, challengeId,
      (durationMs || stepDurations) ? { durationMs, stepDurations } : undefined);

    // Only return pass/fail — never expose scores, thresholds, or breakdowns
    res.json({
      success: result.success,
      authenticated: result.authenticated,
      message: result.authenticated ? 'Authentication successful.' : 'Authentication failed.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
