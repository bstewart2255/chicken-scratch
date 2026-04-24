import type { Stroke, StrokePoint, RawSignatureData } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';

/**
 * Extract clean strokes from raw signature data.
 * Handles the canonical format: RawSignatureData.strokes[]
 */
export function extractStrokes(data: RawSignatureData): Stroke[] {
  return data.strokes.filter(s => s.points.length > 0);
}

/** Flatten all points from all strokes into a single array */
export function allPoints(strokes: Stroke[]): StrokePoint[] {
  return strokes.flatMap(s => s.points);
}

/**
 * Check whether pressure data is REAL rather than a browser-reported flat
 * default. Previously this was just `some pressure > 0`, which tripped
 * positive on trackpad Safari and many iOS finger-touch captures where
 * the PointerEvent pressure field reports a constant ~0.5 regardless of
 * the user — no biometric signal. The pressure bucket would then match
 * that flat-vs-flat value trivially and contribute 100% similarity for
 * free, rewarding a no-op with 15% of the overall score weight.
 *
 * New gate requires BOTH: some points > 0 AND non-trivial variance across
 * all pressures. Apple Pencil / Wacom produce stddev 0.1–0.3 within a
 * stroke; flat defaults produce stddev 0. MIN_PRESSURE_VARIANCE = 0.02
 * cleanly separates.
 */
export function hasPressureData(strokes: Stroke[]): boolean {
  const pressures: number[] = [];
  for (const s of strokes) {
    for (const p of s.points) {
      pressures.push(p.pressure);
    }
  }
  if (pressures.length === 0) return false;

  // Any non-zero AND meaningful variance across all points.
  const hasNonZero = pressures.some(p => p > 0);
  if (!hasNonZero) return false;

  const mean = pressures.reduce((a, b) => a + b, 0) / pressures.length;
  const variance = pressures.reduce((sum, p) => sum + (p - mean) ** 2, 0) / pressures.length;
  const stdDev = Math.sqrt(variance);

  return stdDev >= THRESHOLDS.MIN_PRESSURE_VARIANCE;
}

/** Check if strokes have timing data */
export function hasTimingData(strokes: Stroke[]): boolean {
  return strokes.some(s => s.points.length > 1 && s.points[1].timestamp > s.points[0].timestamp);
}
