import type { Stroke, PressureFeatures } from '@chicken-scratch/shared';
import { mean, stddev } from './helpers/math.js';
import { allPoints, hasPressureData } from './helpers/stroke-parser.js';

/**
 * Phase 1: Pressure & Touch Analysis (8 features)
 * Returns null when device doesn't support pressure.
 */
export function extractPressureFeatures(strokes: Stroke[]): PressureFeatures | null {
  if (!hasPressureData(strokes)) return null;

  const points = allPoints(strokes);
  const pressures = points.map(p => p.pressure).filter(p => p > 0);

  if (pressures.length === 0) return null;

  const avgPressure = mean(pressures);
  const maxPressure = Math.max(...pressures);
  const minPressure = Math.min(...pressures);
  const pressureStd = stddev(pressures);
  const pressureRange = maxPressure - minPressure;

  // Contact time ratio: points with pressure / total points
  const contactTimeRatio = pressures.length / points.length;

  // Pressure buildup rate: avg rate of pressure increase in first quarter of each stroke
  const buildupRates: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 4) continue;
    const qIdx = Math.floor(pts.length / 4);
    if (qIdx > 0 && pts[qIdx].pressure > 0 && pts[0].pressure >= 0) {
      buildupRates.push((pts[qIdx].pressure - pts[0].pressure) / qIdx);
    }
  }

  // Pressure release rate: avg rate of pressure decrease in last quarter
  const releaseRates: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 4) continue;
    const q3Idx = Math.floor(pts.length * 3 / 4);
    const endIdx = pts.length - 1;
    const span = endIdx - q3Idx;
    if (span > 0) {
      releaseRates.push(Math.abs((pts[endIdx].pressure - pts[q3Idx].pressure) / span));
    }
  }

  return {
    avgPressure,
    maxPressure,
    minPressure,
    pressureStd,
    pressureRange,
    contactTimeRatio,
    pressureBuildupRate: mean(buildupRates),
    pressureReleaseRate: mean(releaseRates),
  };
}
