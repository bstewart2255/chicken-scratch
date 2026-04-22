import { describe, it, expect } from 'vitest';
import type { RawSignatureData, Stroke, StrokePoint } from '@chicken-scratch/shared';
import { computeDtwSimilarity, dtwDistance, __test__ } from '../features/comparison/dtw.js';

function mkPoint(x: number, y: number, t: number, pressure = 0.5): StrokePoint {
  return { x, y, pressure, timestamp: t };
}

function mkStroke(points: StrokePoint[]): Stroke {
  return {
    points,
    startTime: points[0]?.timestamp ?? 0,
    endTime: points[points.length - 1]?.timestamp ?? 0,
  };
}

function mkSig(strokes: Stroke[]): RawSignatureData {
  return {
    strokes,
    canvasSize: { width: 400, height: 200 },
    deviceCapabilities: {
      supportsPressure: true,
      supportsTouch: false,
      inputMethod: 'stylus',
      browser: 'test',
      os: 'test',
    },
    capturedAt: new Date().toISOString(),
  };
}

function diagonalStroke(): Stroke {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < 20; i++) {
    pts.push(mkPoint(10 + i * 5, 10 + i * 3, 1000 + i * 20));
  }
  return mkStroke(pts);
}

describe('DTW similarity', () => {
  it('identical signatures score 100', () => {
    const sig = mkSig([diagonalStroke()]);
    const sim = computeDtwSimilarity(sig, sig);
    expect(sim).toBe(100);
  });

  it('completely different (random vs. diagonal) scores well below 50', () => {
    const genuine = mkSig([diagonalStroke()]);

    const randomPts: StrokePoint[] = [];
    for (let i = 0; i < 20; i++) {
      randomPts.push(mkPoint(Math.random() * 400, Math.random() * 200, 1000 + i * 20));
    }
    const impostor = mkSig([mkStroke(randomPts)]);

    const sim = computeDtwSimilarity(genuine, impostor);
    expect(sim).toBeLessThan(50);
  });

  it('slight noise on same signature scores higher than random', () => {
    const genuine = mkSig([diagonalStroke()]);

    const noisyPts: StrokePoint[] = [];
    for (let i = 0; i < 20; i++) {
      noisyPts.push(mkPoint(10 + i * 5 + (Math.random() - 0.5) * 2,
                            10 + i * 3 + (Math.random() - 0.5) * 2,
                            1000 + i * 20));
    }
    const noisy = mkSig([mkStroke(noisyPts)]);

    const randomPts: StrokePoint[] = [];
    for (let i = 0; i < 20; i++) {
      randomPts.push(mkPoint(Math.random() * 400, Math.random() * 200, 1000 + i * 20));
    }
    const impostor = mkSig([mkStroke(randomPts)]);

    const simNoisy = computeDtwSimilarity(genuine, noisy);
    const simImpostor = computeDtwSimilarity(genuine, impostor);
    expect(simNoisy).toBeGreaterThan(simImpostor);
  });

  it('empty signatures score 0 instead of throwing', () => {
    const empty = mkSig([]);
    const genuine = mkSig([diagonalStroke()]);
    expect(computeDtwSimilarity(empty, genuine)).toBe(0);
    expect(computeDtwSimilarity(genuine, empty)).toBe(0);
  });
});

describe('DTW distance primitive', () => {
  it('identical sequences have distance 0', () => {
    const sig = mkSig([diagonalStroke()]);
    const pts = __test__.flattenAndNormalize(sig);
    expect(dtwDistance(pts, pts)).toBe(0);
  });

  it('distance is symmetric', () => {
    const sigA = mkSig([diagonalStroke()]);
    const sigB = mkSig([mkStroke([
      mkPoint(12, 15, 1000), mkPoint(30, 25, 1020), mkPoint(55, 40, 1040),
      mkPoint(75, 55, 1060), mkPoint(90, 70, 1080),
    ])]);
    const a = __test__.flattenAndNormalize(sigA);
    const b = __test__.flattenAndNormalize(sigB);
    const ab = dtwDistance(a, b);
    const ba = dtwDistance(b, a);
    expect(Math.abs(ab - ba)).toBeLessThan(1e-9);
  });
});
