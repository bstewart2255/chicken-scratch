import type { ShapeScoreBreakdown } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';

/**
 * Compute the final authentication score combining signature and shape scores.
 * finalScore = signatureScore * SIGNATURE_WEIGHT + mean(shapeScores) * SHAPE_WEIGHT
 * (currently 0.70 / 0.30; see THRESHOLDS in shared constants).
 *
 * Also enforces per-modality minimums: both signature and each shape
 * must meet their minimum threshold for authentication to pass.
 */
export function computeCombinedScore(
  signatureScore: number,
  shapeScores: ShapeScoreBreakdown[],
  threshold: number,
): {
  finalScore: number;
  authenticated: boolean;
} {
  const avgShapeScore = shapeScores.length > 0
    ? shapeScores.reduce((sum, s) => sum + s.combinedScore, 0) / shapeScores.length
    : 0;

  const finalScore = Math.round(
    (signatureScore * THRESHOLDS.SIGNATURE_WEIGHT +
     avgShapeScore * THRESHOLDS.SHAPE_WEIGHT) * 100
  ) / 100;

  // Check per-modality minimums
  const signaturePasses = signatureScore >= THRESHOLDS.SIGNATURE_MIN_THRESHOLD;
  const allShapesPass = shapeScores.every(
    s => s.combinedScore >= THRESHOLDS.SHAPE_MIN_THRESHOLD,
  );
  const overallPasses = finalScore >= threshold;

  return {
    finalScore,
    authenticated: signaturePasses && allShapesPass && overallPasses,
  };
}
