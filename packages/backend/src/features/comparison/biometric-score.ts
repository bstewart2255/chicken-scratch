import type { AllFeatures, FeatureComparison } from '@chicken-scratch/shared';

/**
 * Compare a single numeric feature: 1 - |a - b| / max(|a|, |b|)
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
 * Returns a 0-100 score with breakdown by category.
 */
export function compareFeatures(baseline: AllFeatures, attempt: AllFeatures): FeatureComparison {
  // Pressure comparison (null if either lacks pressure data)
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

  const geometricScore = objectSimilarity(
    baseline.geometric as unknown as Record<string, number>,
    attempt.geometric as unknown as Record<string, number>,
  );

  const securityScore = objectSimilarity(
    baseline.security as unknown as Record<string, number>,
    attempt.security as unknown as Record<string, number>,
  );

  // Weighted final score
  // When pressure is available: pressure 20%, timing 30%, geometric 30%, security 20%
  // When no pressure: timing 35%, geometric 40%, security 25%
  let score: number;
  if (pressureScore !== null) {
    score = (pressureScore * 0.2 + timingScore * 0.3 + geometricScore * 0.3 + securityScore * 0.2) * 100;
  } else {
    score = (timingScore * 0.35 + geometricScore * 0.4 + securityScore * 0.25) * 100;
  }

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      pressure: pressureScore !== null ? Math.round(pressureScore * 100 * 100) / 100 : null,
      timing: Math.round(timingScore * 100 * 100) / 100,
      geometric: Math.round(geometricScore * 100 * 100) / 100,
      security: Math.round(securityScore * 100 * 100) / 100,
    },
  };
}
