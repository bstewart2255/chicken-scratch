import type { Stroke, StrokePoint, RawSignatureData } from '@chicken-scratch/shared';

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

/** Check if any stroke has meaningful pressure data (> 0) */
export function hasPressureData(strokes: Stroke[]): boolean {
  return strokes.some(s => s.points.some(p => p.pressure > 0));
}

/** Check if strokes have timing data */
export function hasTimingData(strokes: Stroke[]): boolean {
  return strokes.some(s => s.points.length > 1 && s.points[1].timestamp > s.points[0].timestamp);
}
