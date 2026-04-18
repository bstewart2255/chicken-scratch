import { Router } from 'express';
import type { DiagnosticsAttempt, DiagnosticsUser, UserStats, BaselineSummary } from '@chicken-scratch/shared';
import * as userRepo from '../db/repositories/user.repo.js';
import * as authAttemptRepo from '../db/repositories/auth-attempt.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';
import type { AllFeatures, ShapeSpecificFeatures, ChallengeItemType, DeviceClass } from '@chicken-scratch/shared';
import { runForgerySimulation } from '../services/forgery-simulator.js';

/**
 * Diagnostics reads per-class data. Callers can pass ?deviceClass=mobile or
 * =desktop to scope the response; default is 'mobile' to match the migration
 * backfill so existing bookmarks/links continue to work.
 */
function parseDeviceClass(q: unknown): DeviceClass {
  return q === 'desktop' ? 'desktop' : 'mobile';
}

const router = Router();

// List all users
router.get('/api/diagnostics/users', async (_req, res, next) => {
  try {
    const users = await userRepo.listUsers();
    const result: DiagnosticsUser[] = users.map(u => ({
      id: u.id,
      username: u.username,
      enrolled: !!u.enrolled,
      createdAt: u.created_at,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get all attempts for a user
router.get('/api/diagnostics/users/:username/attempts', async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const attempts = await authAttemptRepo.getAllAttempts(user.id);
    const result: DiagnosticsAttempt[] = attempts.map(a => ({
      id: a.id,
      userId: a.user_id,
      attemptType: (a.attempt_type || 'signature') as 'signature' | 'full',
      score: a.score,
      threshold: a.threshold,
      authenticated: !!a.authenticated,
      breakdown: JSON.parse(a.breakdown),
      signatureFeatures: a.signature_features ? JSON.parse(a.signature_features) : null,
      signatureComparison: a.signature_comparison ? JSON.parse(a.signature_comparison) : null,
      shapeScores: a.shape_scores ? JSON.parse(a.shape_scores) : null,
      shapeDetails: a.shape_details ? JSON.parse(a.shape_details) : null,
      deviceCapabilities: JSON.parse(a.device_capabilities),
      fingerprintMatch: a.fingerprint_match ? JSON.parse(a.fingerprint_match) : null,
      durationMs: a.duration_ms ?? null,
      stepDurations: a.step_durations ? JSON.parse(a.step_durations) : null,
      isForgery: !!a.is_forgery,
      createdAt: a.created_at,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get a single attempt by ID
router.get('/api/diagnostics/users/:username/attempts/:attemptId', async (req, res, next) => {
  try {
    const attempt = await authAttemptRepo.getAttemptById(req.params.attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }

    const result: DiagnosticsAttempt = {
      id: attempt.id,
      userId: attempt.user_id,
      attemptType: (attempt.attempt_type || 'signature') as 'signature' | 'full',
      score: attempt.score,
      threshold: attempt.threshold,
      authenticated: !!attempt.authenticated,
      breakdown: JSON.parse(attempt.breakdown),
      signatureFeatures: attempt.signature_features ? JSON.parse(attempt.signature_features) : null,
      signatureComparison: attempt.signature_comparison ? JSON.parse(attempt.signature_comparison) : null,
      shapeScores: attempt.shape_scores ? JSON.parse(attempt.shape_scores) : null,
      shapeDetails: attempt.shape_details ? JSON.parse(attempt.shape_details) : null,
      deviceCapabilities: JSON.parse(attempt.device_capabilities),
      fingerprintMatch: attempt.fingerprint_match ? JSON.parse(attempt.fingerprint_match) : null,
      durationMs: attempt.duration_ms ?? null,
      stepDurations: attempt.step_durations ? JSON.parse(attempt.step_durations) : null,
      isForgery: !!attempt.is_forgery,
      createdAt: attempt.created_at,
    };
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get user baseline (signature + shapes)
router.get('/api/diagnostics/users/:username/baseline', async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const deviceClass = parseDeviceClass(req.query.deviceClass);
    const [sigBaseline, shapeBaselines] = await Promise.all([
      sigRepo.getBaseline(user.id, deviceClass),
      shapeRepo.getShapeBaselines(user.id, deviceClass),
    ]);

    const result: BaselineSummary = {
      signature: sigBaseline ? {
        avgFeatures: JSON.parse(sigBaseline.avg_features) as AllFeatures,
        featureStdDevs: JSON.parse(sigBaseline.feature_std_devs) as Record<string, number>,
        hasPressureData: !!sigBaseline.has_pressure_data,
      } : null,
      shapes: shapeBaselines.map(sb => ({
        shapeType: sb.shape_type as ChallengeItemType,
        avgBiometricFeatures: JSON.parse(sb.avg_biometric_features) as AllFeatures,
        avgShapeFeatures: sb.avg_shape_features ? JSON.parse(sb.avg_shape_features) as ShapeSpecificFeatures : null,
      })),
    };
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get aggregate stats for a user
router.get('/api/diagnostics/users/:username/stats', async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [stats, attempts] = await Promise.all([
      authAttemptRepo.getAttemptStats(user.id),
      authAttemptRepo.getAllAttempts(user.id),
    ]);

    // Build score distribution buckets (0-10, 10-20, ..., 90-100)
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${(i + 1) * 10}`,
      count: 0,
    }));
    for (const a of attempts) {
      const idx = Math.min(9, Math.floor(a.score / 10));
      buckets[idx].count++;
    }

    const result: UserStats = {
      totalAttempts: stats.count,
      passCount: stats.passCount,
      failCount: stats.failCount,
      meanScore: stats.meanScore,
      stdDev: stats.stdDev,
      minScore: stats.minScore,
      maxScore: stats.maxScore,
      scoreDistribution: buckets,
    };
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get enrollment samples (features only, not raw strokes)
router.get('/api/diagnostics/users/:username/enrollment-samples', async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const deviceClass = parseDeviceClass(req.query.deviceClass);
    const [sigSamples, shapeSamples] = await Promise.all([
      sigRepo.getSamples(user.id, deviceClass),
      shapeRepo.getShapeSamples(user.id, deviceClass),
    ]);

    res.json({
      signatures: sigSamples.map(s => ({
        sampleNumber: s.sample_number,
        features: JSON.parse(s.features),
        mlFeatures: JSON.parse(s.ml_features),
        deviceCapabilities: JSON.parse(s.device_capabilities),
        createdAt: s.created_at,
      })),
      shapes: shapeSamples.map(s => ({
        shapeType: s.shape_type,
        biometricFeatures: JSON.parse(s.biometric_features),
        shapeFeatures: s.shape_features ? JSON.parse(s.shape_features) : null,
        deviceCapabilities: JSON.parse(s.device_capabilities),
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Toggle forgery flag on an attempt
router.patch('/api/diagnostics/attempts/:attemptId/forgery', async (req, res, next) => {
  try {
    const attempt = await authAttemptRepo.getAttemptById(req.params.attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }

    const isForgery = Boolean(req.body?.isForgery);
    await authAttemptRepo.setForgeryFlag(req.params.attemptId, isForgery);
    res.json({ success: true, isForgery });
  } catch (err) {
    next(err);
  }
});

// Run forgery simulation for a user
router.post('/api/diagnostics/users/:username/forgery-simulation', async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const trialsPerLevel = Math.min(100, Math.max(5, Number(req.body?.trialsPerLevel) || 20));
    const result = await runForgerySimulation(req.params.username, trialsPerLevel);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
