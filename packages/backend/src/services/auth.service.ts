import type { RawSignatureData, VerifyResponse, ShapeData, FullVerifyResponse, ShapeScoreBreakdown, AllFeatures, ChallengeItemType, FeatureComparison, DeviceFingerprint, DeviceClass } from '@chicken-scratch/shared';
import type { ShapeAttemptDetail } from '@chicken-scratch/shared';
import { compareFingerprints } from './fingerprint.service.js';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { extractShapeSpecificFeatures } from '../features/extraction/shape.js';
import { extractStrokes } from '../features/extraction/helpers/stroke-parser.js';
import { compareFeatures } from '../features/comparison/biometric-score.js';
import { scoreSignatureAttempt } from '../features/comparison/signature-fusion.js';
import { computeShapeScore, compareShapeFeatures } from '../features/comparison/shape-score.js';
import { computeCombinedScore } from '../features/comparison/combined-score.js';
import { detectDeviceClass } from '../features/device-class.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';
import * as authAttemptRepo from '../db/repositories/auth-attempt.repo.js';
import * as sessionService from './session.service.js';
import type { ShapeSpecificFeatures } from '@chicken-scratch/shared';

export async function verifySignature(
  username: string,
  signatureData: RawSignatureData,
): Promise<VerifyResponse> {
  const deviceClass = detectDeviceClass(signatureData);

  const user = await userRepo.findByUsername(username);
  if (!user) {
    return {
      success: false,
      score: 0,
      threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
      authenticated: false,
      comparison: { score: 0, breakdown: { pressure: null, timing: 0, kinematic: 0, geometric: 0 } },
      message: 'User not found.',
    };
  }

  if (!user.enrolled) {
    return {
      success: false,
      score: 0,
      threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
      authenticated: false,
      comparison: { score: 0, breakdown: { pressure: null, timing: 0, kinematic: 0, geometric: 0 } },
      message: 'User has not completed enrollment.',
    };
  }

  const baseline = await sigRepo.getBaseline(user.id, deviceClass);
  if (!baseline) {
    const enrolled = await sigRepo.getEnrolledClasses(user.id);
    return {
      success: false,
      score: 0,
      threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
      authenticated: false,
      comparison: { score: 0, breakdown: { pressure: null, timing: 0, kinematic: 0, geometric: 0 } },
      message: enrolled.length === 0
        ? 'No baseline found for user.'
        : `This device (${deviceClass}) isn't enrolled. Enrolled: ${enrolled.join(', ')}.`,
    };
  }

  const attemptFeatures = extractAllFeatures(signatureData);
  const baselineFeatures = JSON.parse(baseline.avg_features) as AllFeatures;
  const baselineStdDevs = JSON.parse(baseline.feature_std_devs) as Record<string, number>;

  // Fetch the user's enrolled stroke samples for DTW. Same-class only —
  // DTW against a different-class reference (touch baseline vs. stylus
  // attempt) would spuriously penalize natural capture-device differences.
  const enrollmentSamples = await sigRepo.getSamples(user.id, deviceClass);
  const enrollmentStrokes = enrollmentSamples.map(
    s => JSON.parse(s.stroke_data) as RawSignatureData,
  );

  const comparison = scoreSignatureAttempt(
    baselineFeatures,
    baselineStdDevs,
    enrollmentStrokes,
    signatureData,
    attemptFeatures,
  );
  const threshold = THRESHOLDS.AUTH_SCORE_DEFAULT;
  const authenticated = comparison.score >= threshold;

  await authAttemptRepo.createAttempt(
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
      deviceClass,
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

export async function verifyFull(
  username: string,
  signatureData: RawSignatureData,
  shapes: ShapeData[],
  challengeId: string,
  timing?: { durationMs?: number; stepDurations?: { step: string; durationMs: number }[] },
): Promise<FullVerifyResponse> {
  const threshold = THRESHOLDS.AUTH_SCORE_DEFAULT;
  const deviceClass = detectDeviceClass(signatureData);
  const errorResponse = (
    msg: string,
    extra?: { errorCode?: 'DEVICE_CLASS_MISMATCH'; enrolledClasses?: string[] },
  ): FullVerifyResponse => ({
    success: false,
    authenticated: false,
    finalScore: 0,
    threshold,
    signatureScore: 0,
    shapeScores: [],
    message: msg,
    ...extra,
  });

  // Validate challenge and shape order
  const submittedOrder = shapes.map(s => s.shapeType);
  const orderError = await sessionService.validateShapeOrder(challengeId, submittedOrder);
  if (orderError) return errorResponse(orderError);

  // Timestamp freshness check
  const maxAge = THRESHOLDS.SESSION_TTL_MS;
  const now = Date.now();
  const allCapturedAt = [signatureData.capturedAt, ...shapes.map(s => s.signatureData.capturedAt)];
  for (const ts of allCapturedAt) {
    const age = now - new Date(ts).getTime();
    if (age > maxAge || age < -60_000) {
      return errorResponse('Submission data is too old or has an invalid timestamp.');
    }
  }

  const user = await userRepo.findByUsername(username);
  if (!user) return errorResponse('User not found.');
  if (!user.enrolled) return errorResponse('User has not completed enrollment.');

  // Load baseline for the detected device class. If none exists for this
  // class but others are enrolled, surface the mismatch with a machine-
  // readable code so the client can offer "switch device" or "add this device".
  const sigBaseline = await sigRepo.getBaseline(user.id, deviceClass);
  if (!sigBaseline) {
    const enrolled = await sigRepo.getEnrolledClasses(user.id);
    if (enrolled.length === 0) {
      return errorResponse('No signature baseline found.');
    }
    return errorResponse(
      `You enrolled on ${enrolled.join(' / ')}. Switch to one of those devices to verify, or add this device to your account.`,
      { errorCode: 'DEVICE_CLASS_MISMATCH', enrolledClasses: enrolled },
    );
  }

  const attemptSigFeatures = extractAllFeatures(signatureData);
  const baselineSigFeatures = JSON.parse(sigBaseline.avg_features) as AllFeatures;
  const baselineSigStdDevs = JSON.parse(sigBaseline.feature_std_devs) as Record<string, number>;

  // Signature scoring uses DTW + feature fusion (PR #3). Shape biometrics
  // further down this function still use the feature-only path — shapes
  // enroll one sample per type so DTW's best-of-N aggregation would only
  // see one reference, and shapes are calibration prompts (intentionally
  // standardized) so DTW's sequence-alignment edge is smaller there.
  const sigEnrollmentSamples = await sigRepo.getSamples(user.id, deviceClass);
  const sigEnrollmentStrokes = sigEnrollmentSamples.map(
    s => JSON.parse(s.stroke_data) as RawSignatureData,
  );
  const sigComparison = scoreSignatureAttempt(
    baselineSigFeatures,
    baselineSigStdDevs,
    sigEnrollmentStrokes,
    signatureData,
    attemptSigFeatures,
  );
  const signatureScore = sigComparison.score;

  const shapeScores: ShapeScoreBreakdown[] = [];
  const shapeDetails: ShapeAttemptDetail[] = [];

  for (const shape of shapes) {
    const itemType = shape.shapeType as ChallengeItemType;
    const shapeBaseline = await shapeRepo.getShapeBaseline(user.id, itemType, deviceClass);
    if (!shapeBaseline) {
      return errorResponse(`No baseline found for '${shape.shapeType}' on ${deviceClass}.`);
    }

    const strokes = extractStrokes(shape.signatureData);
    const attemptBiometric = extractAllFeatures(shape.signatureData);
    const attemptShapeFeatures = extractShapeSpecificFeatures(strokes, itemType);
    const baselineBiometric = JSON.parse(shapeBaseline.avg_biometric_features) as AllFeatures;
    const baselineShapeFeatures = JSON.parse(shapeBaseline.avg_shape_features) as ShapeSpecificFeatures;
    // Shape baselines hold per-user biometric stddevs (migration 019 + CV-prior
    // defaults at enrollment time, since shapes enroll only one sample).
    // May be null for pre-migration rows; the matcher falls back cleanly.
    const baselineShapeStdDevs = shapeBaseline.biometric_std_devs
      ? JSON.parse(shapeBaseline.biometric_std_devs) as Record<string, number>
      : undefined;

    const biometricComparison = compareFeatures(baselineBiometric, attemptBiometric, baselineShapeStdDevs);
    const shapeFeatureScore = compareShapeFeatures(baselineShapeFeatures, attemptShapeFeatures);
    const { biometricScore, shapeScore, combinedScore } = computeShapeScore(
      baselineBiometric,
      attemptBiometric,
      baselineShapeFeatures,
      attemptShapeFeatures,
      baselineShapeStdDevs,
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

  const { finalScore, authenticated } = computeCombinedScore(signatureScore, shapeScores, threshold);

  // Compare device fingerprints (scoped to the current device class so we
  // don't mix a phone enrollment fingerprint against a desktop verify).
  // Reuses sigEnrollmentSamples fetched above for DTW — avoids a duplicate
  // repository round-trip.
  let fingerprintMatch: Record<string, unknown> | undefined;
  if (sigEnrollmentSamples.length > 0 && signatureData.deviceCapabilities.fingerprint) {
    const enrollDeviceCaps = JSON.parse(sigEnrollmentSamples[0].device_capabilities);
    if (enrollDeviceCaps.fingerprint) {
      const match = compareFingerprints(
        enrollDeviceCaps.fingerprint as DeviceFingerprint,
        signatureData.deviceCapabilities.fingerprint,
      );
      fingerprintMatch = match as unknown as Record<string, unknown>;
    }
  }

  await authAttemptRepo.createAttempt(
    user.id,
    finalScore,
    threshold,
    authenticated,
    sigComparison,
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
      deviceClass,
    },
  );

  return {
    success: true,
    authenticated,
    finalScore,
    threshold,
    signatureScore: Math.round(signatureScore * 100) / 100,
    shapeScores,
    deviceClass,
    message: authenticated
      ? `Authentication successful (score: ${finalScore}).`
      : `Authentication failed (score: ${finalScore}, threshold: ${threshold}).`,
  };
}
