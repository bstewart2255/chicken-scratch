import type { AllFeatures, FeatureComparison } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';

/**
 * Error thrown when baseline and attempt were extracted under different
 * feature versions. The runtime guard prevents silently-wrong scores when
 * the feature set is mid-migration. Callers should surface a "please
 * re-enroll" UX when they catch this.
 */
export class FeatureVersionMismatchError extends Error {
  readonly baselineVersion: string;
  readonly attemptVersion: string;
  constructor(baselineVersion: string, attemptVersion: string) {
    super(
      `Feature version mismatch: baseline=${baselineVersion}, attempt=${attemptVersion}. ` +
      `Baseline was computed under a different feature schema and cannot be compared. ` +
      `User must re-enroll.`,
    );
    this.name = 'FeatureVersionMismatchError';
    this.baselineVersion = baselineVersion;
    this.attemptVersion = attemptVersion;
  }
}

/**
 * Compare a single numeric feature: 1 - |a - b| / max(|a|, |b|).
 * Returns a similarity score from 0 (completely different) to 1 (identical).
 */
function featureSimilarity(stored: number, attempt: number): number {
  const maxVal = Math.max(Math.abs(stored), Math.abs(attempt));
  if (maxVal === 0) return 1; // both zero = identical
  return 1 - Math.abs(stored - attempt) / maxVal;
}

/** Average similarity across all numeric fields of two objects */
function objectSimilarity(stored: Record<string, number>, attempt: Record<string, number>): number {
  const keys = Object.keys(stored);
  if (keys.length === 0) return 0;
  let total = 0;
  for (const key of keys) {
    total += featureSimilarity(stored[key], attempt[key] ?? 0);
  }
  return total / keys.length;
}

/**
 * Compare biometric features between a stored baseline and an authentication attempt.
 * Returns a 0-100 score with breakdown by bucket.
 *
 * Throws FeatureVersionMismatchError if the two sides were extracted under
 * different feature-schema versions.
 */
export function compareFeatures(baseline: AllFeatures, attempt: AllFeatures): FeatureComparison {
  // Runtime version guard — see class doc above.
  const baselineVersion = baseline.metadata?.featureVersion ?? 'unknown';
  const attemptVersion = attempt.metadata?.featureVersion ?? THRESHOLDS.FEATURE_VERSION;
  if (baselineVersion !== attemptVersion) {
    throw new FeatureVersionMismatchError(baselineVersion, attemptVersion);
  }

  // Pressure comparison (null if either lacks pressure data — bucket is skipped
  // and remaining bucket weights renormalize below).
  let pressureScore: number | null = null;
  if (baseline.pressure && attempt.pressure) {
    pressureScore = objectSimilarity(
      baseline.pressure as unknown as Record<string, number>,
      attempt.pressure as unknown as Record<string, number>,
    );
  }

  const timingScore = objectSimilarity(
    baseline.timing as unknown as Record<string, number>,
    attempt.timing as unknown as Record<string, number>,
  );

  const kinematicScore = objectSimilarity(
    baseline.kinematic as unknown as Record<string, number>,
    attempt.kinematic as unknown as Record<string, number>,
  );

  const geometricScore = objectSimilarity(
    baseline.geometric as unknown as Record<string, number>,
    attempt.geometric as unknown as Record<string, number>,
  );

  // Weighted final score. Weights are declared in thresholds.ts and renormalize
  // automatically when pressure is unavailable.
  const score = pressureScore !== null
    ? (pressureScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.pressure +
       timingScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.timing +
       kinematicScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.kinematic +
       geometricScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.geometric) * 100
    : (timingScore * THRESHOLDS.WEIGHT_NO_PRESSURE.timing +
       kinematicScore * THRESHOLDS.WEIGHT_NO_PRESSURE.kinematic +
       geometricScore * THRESHOLDS.WEIGHT_NO_PRESSURE.geometric) * 100;

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      pressure: pressureScore !== null ? Math.round(pressureScore * 100 * 100) / 100 : null,
      timing: Math.round(timingScore * 100 * 100) / 100,
      kinematic: Math.round(kinematicScore * 100 * 100) / 100,
      geometric: Math.round(geometricScore * 100 * 100) / 100,
    },
    // Pass through the attempt's diagnostic flags so callers can surface
    // anomaly signals alongside the match result.
    diagnosticFlags: attempt.diagnosticFlags,
  };
}
