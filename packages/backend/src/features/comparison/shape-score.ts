import type { ShapeSpecificFeatures } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { compareFeatures } from './biometric-score.js';
import type { AllFeatures } from '@chicken-scratch/shared';

/**
 * Compare a single numeric feature: 1 - |a - b| / max(|a|, |b|)
 */
function featureSimilarity(stored: number, attempt: number): number {
  const maxVal = Math.max(Math.abs(stored), Math.abs(attempt));
  if (maxVal === 0) return 1;
  return 1 - Math.abs(stored - attempt) / maxVal;
}

/**
 * Compare shape-specific features between baseline and attempt.
 * Returns a 0-100 similarity score.
 */
export function compareShapeFeatures(
  baseline: ShapeSpecificFeatures,
  attempt: ShapeSpecificFeatures,
): number {
  const baseObj = baseline as unknown as Record<string, number>;
  const attemptObj = attempt as unknown as Record<string, number>;
  const keys = Object.keys(baseObj);
  if (keys.length === 0) return 0;

  let total = 0;
  for (const key of keys) {
    total += featureSimilarity(baseObj[key], attemptObj[key] ?? 0);
  }
  return (total / keys.length) * 100;
}

/**
 * Compute the combined shape score: biometric 70% + shape-specific 30%.
 * Returns 0-100.
 */
export function computeShapeScore(
  baselineBiometric: AllFeatures,
  attemptBiometric: AllFeatures,
  baselineShape: ShapeSpecificFeatures,
  attemptShape: ShapeSpecificFeatures,
): { biometricScore: number; shapeScore: number; combinedScore: number } {
  const biometricComparison = compareFeatures(baselineBiometric, attemptBiometric);
  const biometricScore = biometricComparison.score;
  const shapeScore = compareShapeFeatures(baselineShape, attemptShape);

  const combinedScore = Math.round(
    (biometricScore * THRESHOLDS.SHAPE_BIOMETRIC_WEIGHT +
     shapeScore * THRESHOLDS.SHAPE_SPECIFIC_WEIGHT) * 100
  ) / 100;

  return { biometricScore, shapeScore, combinedScore };
}
