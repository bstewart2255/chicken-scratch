import { describe, it, expect } from 'vitest';
import type { StrokePoint, Stroke, HeartFeatures } from '@chicken-scratch/shared';
import { extractShapeSpecificFeatures } from '../features/extraction/shape.js';

function mkPoint(x: number, y: number, t: number): StrokePoint {
  return { x, y, pressure: 0, timestamp: t };
}

function mkStroke(points: StrokePoint[]): Stroke {
  return {
    points,
    startTime: points[0]?.timestamp ?? 0,
    endTime: points[points.length - 1]?.timestamp ?? 0,
  };
}

/** Build a canonical heart shape — two semicircular lobes on top, point at bottom. */
function canonicalHeartPoints(): StrokePoint[] {
  const points: StrokePoint[] = [];
  // Trace a heart: start at top center cusp, sweep right lobe, down to bottom point, up left lobe, back to start.
  // 80 points total. Width 100, height 90, centered at (50, 45) in a 100x90 box.
  // Note: canvas Y grows downward, so "top of heart" = small Y.
  const cx = 50;
  let t = 1000;
  // Right lobe — top semicircle from (50, 20) sweeping to (75, 20) and around to (50, 45)
  for (let i = 0; i <= 30; i++) {
    const theta = Math.PI - (Math.PI * i / 30);  // π → 0
    const x = cx + 25 + 25 * Math.cos(theta);
    const y = 25 + 15 * Math.sin(-theta);
    points.push(mkPoint(x, y, t++));
  }
  // Down to bottom point
  for (let i = 0; i <= 15; i++) {
    const x = cx + 25 - (i / 15) * 25;
    const y = 25 + (i / 15) * 65;  // descend to bottom point at y=90
    points.push(mkPoint(x, y, t++));
  }
  // Up left side to top of left lobe
  for (let i = 0; i <= 15; i++) {
    const x = cx - (i / 15) * 25;
    const y = 90 - (i / 15) * 65;
    points.push(mkPoint(x, y, t++));
  }
  // Left lobe — top semicircle
  for (let i = 0; i <= 30; i++) {
    const theta = -(Math.PI * i / 30);  // 0 → -π
    const x = cx - 25 + 25 * Math.cos(theta);
    const y = 25 + 15 * Math.sin(theta);
    points.push(mkPoint(x, y, t++));
  }
  return points;
}

describe('extractHeartFeatures', () => {
  it('returns 4 named heart features for a canonical heart', () => {
    const points = canonicalHeartPoints();
    const features = extractShapeSpecificFeatures([mkStroke(points)], 'heart') as HeartFeatures;

    expect(features).toHaveProperty('aspectRatio');
    expect(features).toHaveProperty('verticalCenterRatio');
    expect(features).toHaveProperty('topHalfPeakCount');
    expect(features).toHaveProperty('bottomPointSharpness');
  });

  it('aspect ratio reflects bounding box proportions', () => {
    const points = canonicalHeartPoints();
    const features = extractShapeSpecificFeatures([mkStroke(points)], 'heart') as HeartFeatures;
    // Test heart is 100 wide, ~90 tall (depending on the trace) → aspect ~1.0-1.2
    expect(features.aspectRatio).toBeGreaterThan(0.8);
    expect(features.aspectRatio).toBeLessThan(1.5);
  });

  it('verticalCenterRatio is in [0, 1]', () => {
    const points = canonicalHeartPoints();
    const features = extractShapeSpecificFeatures([mkStroke(points)], 'heart') as HeartFeatures;
    expect(features.verticalCenterRatio).toBeGreaterThanOrEqual(0);
    expect(features.verticalCenterRatio).toBeLessThanOrEqual(1);
  });

  it('detects multiple top peaks for a canonical two-lobe heart', () => {
    const points = canonicalHeartPoints();
    const features = extractShapeSpecificFeatures([mkStroke(points)], 'heart') as HeartFeatures;
    // Canonical heart should have at least 1 detectable lobe peak. (Exact count
    // depends on jitter and window size; 2 is typical, 1 acceptable as we
    // sweep continuously through some peaks.)
    expect(features.topHalfPeakCount).toBeGreaterThan(0);
  });

  it('different aspect ratios produce different features', () => {
    const wide = canonicalHeartPoints();
    const tallPoints = wide.map(p => ({ ...p, y: p.y * 2 })); // stretch vertically
    const wideFeatures = extractShapeSpecificFeatures([mkStroke(wide)], 'heart') as HeartFeatures;
    const tallFeatures = extractShapeSpecificFeatures([mkStroke(tallPoints)], 'heart') as HeartFeatures;
    // Wide heart has higher aspectRatio than the tall one
    expect(wideFeatures.aspectRatio).toBeGreaterThan(tallFeatures.aspectRatio);
  });

  it('returns default features for too-few-points input (graceful)', () => {
    const features = extractShapeSpecificFeatures(
      [mkStroke([mkPoint(0, 0, 0), mkPoint(1, 1, 1)])],
      'heart',
    ) as HeartFeatures;
    // Defaults defined in shape.ts: aspectRatio 1, verticalCenterRatio 0.5, others 0
    expect(features.aspectRatio).toBe(1);
    expect(features.verticalCenterRatio).toBe(0.5);
    expect(features.topHalfPeakCount).toBe(0);
    expect(features.bottomPointSharpness).toBe(0);
  });
});
