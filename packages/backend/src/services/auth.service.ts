import type { RawSignatureData, VerifyResponse, ShapeData, FullVerifyResponse, ShapeScoreBreakdown, AllFeatures, ChallengeItemType, FeatureComparison, DeviceFingerprint } from '@chicken-scratch/shared';
import type { ShapeAttemptDetail } from '@chicken-scratch/shared';
import { compareFingerprints } from './fingerprint.service.js';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { extractShapeSpecificFeatures } from '../features/extraction/shape.js';
import { extractStrokes } from '../features/extraction/helpers/stroke-parser.js';
import { compareFeatures } from '../features/comparison/biometric-score.js';
import { computeShapeScore, compareShapeFeatures } from '../features/comparison/shape-score.js';
import { computeCombinedScore } from '../features/comparison/combined-score.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';
import * as authAttemptRepo from '../db/repositories/auth-attempt.repo.js';
import * as sessionService from './session.service.js';
import type { ShapeSpecificFeatures } from '@chicken-scratch/shared';

export function verifySignature(
  username: string,
  signatureData: RawSignatureData,
): VerifyResponse {
  const user = userRepo.findByUsername(username);
  if (!user) {
    return {
      success: false,
      score: 0,
      threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
      authenticated: false,
      comparison: { score: 0, breakdown: { pressure: null, timing: 0, geometric: 0, security: 0 } },
      message: 'User not found.',
    };
  }

  if (!user.enrolled) {
    return {
      success: false,
      score: 0,
      threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
      authenticated: false,
      comparison: { score: 0, breakdown: { pressure: null, timing: 0, geometric: 0, security: 0 } },
      message: 'User has not completed enrollment.',
    };
  }

  const baseline = sigRepo.getBaseline(user.id);
  if (!baseline) {
    return {
      success: false,
      score: 0,
      threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
      authenticated: false,
      comparison: { score: 0, breakdown: { pressure: null, timing: 0, geometric: 0, security: 0 } },
      message: 'No baseline found for user.',
    };
  }

  // Extract features from the attempt
  const attemptFeatures = extractAllFeatures(signatureData);
  const baselineFeatures = JSON.parse(baseline.avg_features) as AllFeatures;

  // Compare
  const comparison = compareFeatures(baselineFeatures, attemptFeatures);
  const threshold = THRESHOLDS.AUTH_SCORE_DEFAULT;
  const authenticated = comparison.score >= threshold;

  // Log the attempt with full diagnostic data
  authAttemptRepo.createAttempt(
    user.id,
    comparison.score,
    threshold,
    authenticated,
    comparison,
    signatureData.deviceCapabilities,
    {
      attemptType: 'signature',
      signatureFeatures: attemptFeatures,
      signatureComparison: comparison,
    },
  );

  return {
    success: true,
    score: comparison.score,
    threshold,
    authenticated,
    comparison,
    message: authenticated
      ? `Authentication successful (score: ${comparison.score}).`
      : `Authentication failed (score: ${comparison.score}, threshold: ${threshold}).`,
  };
}

export function verifyFull(
  username: string,
  signatureData: RawSignatureData,
  shapes: ShapeData[],
  challengeId: string,
  timing?: { durationMs?: number; stepDurations?: { step: string; durationMs: number }[] },
): FullVerifyResponse {
  const threshold = THRESHOLDS.AUTH_SCORE_DEFAULT;
  const errorResponse = (msg: string): FullVerifyResponse => ({
    success: false,
    authenticated: false,
    finalScore: 0,
    threshold,
    signatureScore: 0,
    shapeScores: [],
    message: msg,
  });

  // Validate challenge and shape order (one-time token — rejects replayed challenge IDs)
  const submittedOrder = shapes.map(s => s.shapeType);
  const orderError = sessionService.validateShapeOrder(challengeId, submittedOrder);
  if (orderError) return errorResponse(orderError);

  // Timestamp freshness — reject stale stroke data
  const maxAge = THRESHOLDS.SESSION_TTL_MS; // same as session TTL (5 min)
  const now = Date.now();
  const allCapturedAt = [signatureData.capturedAt, ...shapes.map(s => s.signatureData.capturedAt)];
  for (const ts of allCapturedAt) {
    const age = now - new Date(ts).getTime();
    if (age > maxAge || age < -60_000) { // allow 60s clock skew into the future
      return errorResponse('Submission data is too old or has an invalid timestamp.');
    }
  }

  const user = userRepo.findByUsername(username);
  if (!user) return errorResponse('User not found.');
  if (!user.enrolled) return errorResponse('User has not completed enrollment.');

  // Signature scoring
  const sigBaseline = sigRepo.getBaseline(user.id);
  if (!sigBaseline) return errorResponse('No signature baseline found.');

  const attemptSigFeatures = extractAllFeatures(signatureData);
  const baselineSigFeatures = JSON.parse(sigBaseline.avg_features) as AllFeatures;
  const sigComparison = compareFeatures(baselineSigFeatures, attemptSigFeatures);
  const signatureScore = sigComparison.score;

  // Shape + drawing scoring with detailed diagnostics
  const shapeScores: ShapeScoreBreakdown[] = [];
  const shapeDetails: ShapeAttemptDetail[] = [];

  for (const shape of shapes) {
    const itemType = shape.shapeType as ChallengeItemType;
    const shapeBaseline = shapeRepo.getShapeBaseline(user.id, itemType);
    if (!shapeBaseline) {
      return errorResponse(`No baseline found for '${shape.shapeType}'.`);
    }

    const strokes = extractStrokes(shape.signatureData);
    const attemptBiometric = extractAllFeatures(shape.signatureData);
    const attemptShapeFeatures = extractShapeSpecificFeatures(strokes, itemType);
    const baselineBiometric = JSON.parse(shapeBaseline.avg_biometric_features) as AllFeatures;
    const baselineShapeFeatures = JSON.parse(shapeBaseline.avg_shape_features) as ShapeSpecificFeatures;

    const biometricComparison = compareFeatures(baselineBiometric, attemptBiometric);
    const shapeFeatureScore = compareShapeFeatures(baselineShapeFeatures, attemptShapeFeatures);
    const { biometricScore, shapeScore, combinedScore } = computeShapeScore(
      baselineBiometric,
      attemptBiometric,
      baselineShapeFeatures,
      attemptShapeFeatures,
    );

    shapeScores.push({
      shapeType: itemType,
      biometricScore: Math.round(biometricScore * 100) / 100,
      shapeScore: Math.round(shapeScore * 100) / 100,
      combinedScore: Math.round(combinedScore * 100) / 100,
    });

    shapeDetails.push({
      shapeType: itemType,
      attemptBiometricFeatures: attemptBiometric,
      attemptShapeFeatures,
      biometricComparison,
      shapeFeatureScore: Math.round(shapeFeatureScore * 100) / 100,
    });
  }

  // Combined scoring
  const { finalScore, authenticated } = computeCombinedScore(signatureScore, shapeScores, threshold);

  // Compare device fingerprints (enrollment vs verification)
  let fingerprintMatch: Record<string, unknown> | undefined;
  const enrollmentSamples = sigRepo.getSamples(user.id);
  if (enrollmentSamples.length > 0 && signatureData.deviceCapabilities.fingerprint) {
    const enrollDeviceCaps = JSON.parse(enrollmentSamples[0].device_capabilities);
    if (enrollDeviceCaps.fingerprint) {
      const match = compareFingerprints(
        enrollDeviceCaps.fingerprint as DeviceFingerprint,
        signatureData.deviceCapabilities.fingerprint,
      );
      fingerprintMatch = match as unknown as Record<string, unknown>;
    }
  }

  // Log attempt with full diagnostic data
  authAttemptRepo.createAttempt(
    user.id,
    finalScore,
    threshold,
    authenticated,
    sigComparison, // Store the actual signature comparison, not a dummy
    signatureData.deviceCapabilities,
    {
      attemptType: 'full',
      signatureFeatures: attemptSigFeatures,
      signatureComparison: sigComparison,
      shapeScores,
      shapeDetails,
      fingerprintMatch,
      durationMs: timing?.durationMs,
      stepDurations: timing?.stepDurations,
    },
  );

  return {
    success: true,
    authenticated,
    finalScore,
    threshold,
    signatureScore: Math.round(signatureScore * 100) / 100,
    shapeScores,
    message: authenticated
      ? `Authentication successful (score: ${finalScore}).`
      : `Authentication failed (score: ${finalScore}, threshold: ${threshold}).`,
  };
}
