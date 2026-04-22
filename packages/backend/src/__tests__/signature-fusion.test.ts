import { describe, it, expect } from 'vitest';
import type { RawSignatureData, Stroke, StrokePoint } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { scoreSignatureAttempt } from '../features/comparison/signature-fusion.js';

function mkPoint(x: number, y: number, t: number, pressure = 0): StrokePoint {
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
      supportsPressure: false,
      supportsTouch: true,
      inputMethod: 'touch',
      browser: 'test',
      os: 'test',
    },
    capturedAt: new Date().toISOString(),
  };
}

function diagonalStroke(seed = 0): Stroke {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < 20; i++) {
    pts.push(mkPoint(10 + i * 5 + seed, 10 + i * 3, 1000 + i * 20));
  }
  return mkStroke(pts);
}

function randomStroke(): Stroke {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < 20; i++) {
    pts.push(mkPoint(Math.random() * 400, Math.random() * 200, 1000 + i * 20));
  }
  return mkStroke(pts);
}

describe('scoreSignatureAttempt (DTW + feature fusion)', () => {
  it('identical attempt against identical enrollments scores near 100', () => {
    const sig = mkSig([diagonalStroke()]);
    const baseline = extractAllFeatures(sig);
    const stds: Record<string, number> = {}; // no stddevs → legacy fallback
    const result = scoreSignatureAttempt(baseline, stds, [sig, sig, sig], sig, baseline);

    expect(result.score).toBeGreaterThanOrEqual(99.9);
    expect(result.dtwScore).toBe(100);
    expect(result.dtwScores).toEqual([100, 100, 100]);
    expect(result.featureScore).toBe(100);
  });

  it('random attempt against genuine enrollments scores much lower (forgery signal)', () => {
    const genuineSig = mkSig([diagonalStroke()]);
    const genuineFeatures = extractAllFeatures(genuineSig);
    const fakeSig = mkSig([randomStroke()]);
    const fakeFeatures = extractAllFeatures(fakeSig);

    const result = scoreSignatureAttempt(
      genuineFeatures,
      {},
      [genuineSig, genuineSig, genuineSig],
      fakeSig,
      fakeFeatures,
    );

    expect(result.score).toBeLessThan(70);
    expect(result.dtwScore!).toBeLessThan(60);
  });

  it('falls back to feature-only scoring when no enrollment samples are available', () => {
    const sig = mkSig([diagonalStroke()]);
    const features = extractAllFeatures(sig);
    const result = scoreSignatureAttempt(features, {}, [], sig, features);

    expect(result.score).toBe(100);       // identical features
    expect(result.dtwScore).toBeUndefined();
    expect(result.dtwScores).toBeUndefined();
    expect(result.featureScore).toBe(100);
  });

  it('best-of-N aggregation picks the highest per-sample similarity', () => {
    // Three enrollments: one close to attempt, two far.
    const attemptSig = mkSig([diagonalStroke(0)]);
    const closeEnrollment = mkSig([diagonalStroke(0)]);    // identical
    const farEnrollment = mkSig([randomStroke()]);
    const baseline = extractAllFeatures(closeEnrollment);
    const attemptFeatures = extractAllFeatures(attemptSig);

    const result = scoreSignatureAttempt(
      baseline,
      {},
      [farEnrollment, closeEnrollment, farEnrollment],
      attemptSig,
      attemptFeatures,
    );

    // DTW best should be 100 (the matching sample); per-sample should include
    // that 100 and lower values for the mismatched samples.
    expect(result.dtwScore).toBe(100);
    expect(result.dtwScores).toBeDefined();
    expect(Math.max(...result.dtwScores!)).toBe(100);
    // At least one "far" enrollment should score noticeably lower
    expect(Math.min(...result.dtwScores!)).toBeLessThan(60);
  });

  it('fusion weight matches THRESHOLDS.DTW_FUSION_WEIGHT', () => {
    // Contrived: DTW = 100 (identical stroke in enrollment), feature = 50
    // (artificially perturb feature score by using a different baseline's
    // features). Expected fused = 0.6*100 + 0.4*50 = 80.
    const rawSig = mkSig([diagonalStroke()]);
    const differentFeaturesBaseline = extractAllFeatures(mkSig([randomStroke()]));
    const attemptFeatures = extractAllFeatures(rawSig);

    const result = scoreSignatureAttempt(
      differentFeaturesBaseline,
      {},
      [rawSig],
      rawSig,
      attemptFeatures,
    );

    const w = THRESHOLDS.DTW_FUSION_WEIGHT;
    const expected = w * result.dtwScore! + (1 - w) * result.featureScore!;
    expect(result.score).toBeCloseTo(Math.round(expected * 100) / 100, 1);
  });

  it('DTW_FUSION_WEIGHT is the documented 0.6', () => {
    expect(THRESHOLDS.DTW_FUSION_WEIGHT).toBe(0.6);
  });

  it('preserves breakdown fields from the feature matcher', () => {
    const sig = mkSig([diagonalStroke()]);
    const features = extractAllFeatures(sig);
    const result = scoreSignatureAttempt(features, {}, [sig], sig, features);

    // Same buckets as plain compareFeatures — we're extending, not replacing.
    expect(result.breakdown).toBeDefined();
    expect(Object.keys(result.breakdown).sort()).toEqual(
      ['geometric', 'kinematic', 'pressure', 'timing'],
    );
  });

  it('still surfaces diagnosticFlags through the fusion layer', () => {
    const sig = mkSig([diagonalStroke()]);
    const features = extractAllFeatures(sig);
    const result = scoreSignatureAttempt(features, {}, [sig], sig, features);
    expect(result.diagnosticFlags).toBeDefined();
  });
});
