import { describe, it, expect } from 'vitest';
import type { RawSignatureData, Stroke, StrokePoint } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import {
  compareFeatures,
  __test__ as bioTest,
} from '../features/comparison/biometric-score.js';

const { featureSimilarityMahalanobis, MAHALANOBIS_K, MIN_REL_STDDEV } = bioTest;

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

function horizontalLineStroke(): Stroke {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < 20; i++) {
    pts.push(mkPoint(10 + i * 10, 50, 1000 + i * 10));
  }
  return mkStroke(pts);
}

describe('featureSimilarityMahalanobis', () => {
  it('identical values score 1.0 regardless of stddev', () => {
    expect(featureSimilarityMahalanobis(100, 100, 10)).toBe(1);
    expect(featureSimilarityMahalanobis(100, 100, 0)).toBe(1);
    expect(featureSimilarityMahalanobis(0.5, 0.5, 0.1)).toBe(1);
  });

  it('attempts within 1 stddev score high', () => {
    // |diff| = 1*σ, k=2.5 → similarity = 1 - 1/2.5 = 0.6
    const s = featureSimilarityMahalanobis(100, 110, 10);
    expect(s).toBeCloseTo(0.6, 2);
  });

  it('attempts at exactly k*stddev score 0', () => {
    // |diff| = 2.5*σ exactly → similarity = 0
    const s = featureSimilarityMahalanobis(100, 100 + 2.5 * 10, 10);
    expect(s).toBeCloseTo(0, 6);
  });

  it('attempts beyond k*stddev clamp to 0', () => {
    const s = featureSimilarityMahalanobis(100, 1000, 10);
    expect(s).toBe(0);
  });

  it('zero-stddev uses the magnitude floor (5% of baseline)', () => {
    // stddev = 0, baseline = 100 → floor = max(MIN_ABS, 0.05 * 100) = 5
    // |diff| = 5 → 1*floor → 1 - 1/2.5 = 0.6
    const s = featureSimilarityMahalanobis(100, 105, 0);
    expect(s).toBeCloseTo(0.6, 2);

    // Going 2.5*floor away → 0
    const s2 = featureSimilarityMahalanobis(100, 100 + 2.5 * 5, 0);
    expect(s2).toBeCloseTo(0, 6);
  });

  it('MIN_REL_STDDEV floor matches documented 5%', () => {
    expect(MIN_REL_STDDEV).toBe(0.05);
  });

  it('MAHALANOBIS_K matches documented 2.5', () => {
    expect(MAHALANOBIS_K).toBe(2.5);
  });

  it('undefined stddev falls back to the legacy relative-error formula', () => {
    // Legacy: 1 - |100 - 150| / max(100, 150) = 1 - 50/150 = 0.667
    const s = featureSimilarityMahalanobis(100, 150, undefined);
    expect(s).toBeCloseTo(2 / 3, 3);
  });

  it('undefined stddev on identical values still scores 1.0', () => {
    expect(featureSimilarityMahalanobis(0, 0, undefined)).toBe(1);
    expect(featureSimilarityMahalanobis(100, 100, undefined)).toBe(1);
  });

  it('user with high natural variance gets more tolerance than one with low variance', () => {
    // Two users both enrolled with baseline=100, both attempt=130.
    // User A was consistent: σ = 5 → tolerance = 12.5 → diff 30 → sim = 0 (clamped)
    // User B was noisy:      σ = 20 → tolerance = 50 → diff 30 → sim = 0.4
    const strictUser = featureSimilarityMahalanobis(100, 130, 5);
    const noisyUser = featureSimilarityMahalanobis(100, 130, 20);
    expect(noisyUser).toBeGreaterThan(strictUser);
    expect(strictUser).toBe(0);
    expect(noisyUser).toBeCloseTo(0.4, 2);
  });
});

describe('compareFeatures with Mahalanobis scaling', () => {
  it('identical features score 100 with or without stddevs', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const baseline = extractAllFeatures(sig);
    const attempt = extractAllFeatures(sig);

    const withoutStds = compareFeatures(baseline, attempt);
    expect(withoutStds.score).toBe(100);

    const stds: Record<string, number> = {};
    for (const k of Object.keys(baseline.timing)) stds[`timing.${k}`] = 50;
    for (const k of Object.keys(baseline.kinematic)) stds[`kinematic.${k}`] = 0.1;
    for (const k of Object.keys(baseline.geometric)) stds[`geometric.${k}`] = 5;
    const withStds = compareFeatures(baseline, attempt, stds);
    expect(withStds.score).toBe(100);
  });

  it('missing std entry for a feature falls back to legacy formula just for that feature', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const baseline = extractAllFeatures(sig);
    const attempt = extractAllFeatures(sig);
    // Zero out the stddevs map entirely — matcher should fall back to legacy
    // per-feature and still score 100 for identical inputs.
    const emptyStds: Record<string, number> = {};
    const result = compareFeatures(baseline, attempt, emptyStds);
    expect(result.score).toBe(100);
  });

  it('wider stddevs produce higher scores on a genuinely perturbed attempt', () => {
    // Build baseline from one stroke shape, attempt from a structurally
    // different one (different length, different speed profile). This
    // guarantees several bucket-level feature deltas that the stddev scaling
    // actually has room to act on.
    const fastPts: StrokePoint[] = [];
    for (let i = 0; i < 20; i++) fastPts.push(mkPoint(10 + i * 15, 50, 1000 + i * 5));
    const slowPts: StrokePoint[] = [];
    for (let i = 0; i < 30; i++) slowPts.push(mkPoint(10 + i * 8, 60, 1000 + i * 25));

    const baseline = extractAllFeatures(mkSig([mkStroke(fastPts)]));
    const attempt = extractAllFeatures(mkSig([mkStroke(slowPts)]));

    // Tight stddevs — floor at 0.05*|baseline| still leaves narrow tolerance
    const tightStds: Record<string, number> = {};
    for (const k of Object.keys(baseline.timing)) tightStds[`timing.${k}`] = 0.001;
    for (const k of Object.keys(baseline.kinematic)) tightStds[`kinematic.${k}`] = 0.001;
    for (const k of Object.keys(baseline.geometric)) tightStds[`geometric.${k}`] = 0.001;

    // Loose stddevs — explicit large absolute values that dominate the floor
    const looseStds: Record<string, number> = {};
    for (const k of Object.keys(baseline.timing)) {
      looseStds[`timing.${k}`] = Math.max(Math.abs((baseline.timing as unknown as Record<string, number>)[k]) * 10, 100);
    }
    for (const k of Object.keys(baseline.kinematic)) {
      looseStds[`kinematic.${k}`] = Math.max(Math.abs((baseline.kinematic as unknown as Record<string, number>)[k]) * 10, 10);
    }
    for (const k of Object.keys(baseline.geometric)) {
      looseStds[`geometric.${k}`] = Math.max(Math.abs((baseline.geometric as unknown as Record<string, number>)[k]) * 10, 100);
    }

    const tightResult = compareFeatures(baseline, attempt, tightStds);
    const looseResult = compareFeatures(baseline, attempt, looseStds);
    // Loose tolerance should never score lower than tight tolerance on the
    // same attempt — that's the whole point of per-user variance scaling.
    expect(looseResult.score).toBeGreaterThanOrEqual(tightResult.score);
    // And on a meaningfully different attempt, there should be a gap.
    expect(looseResult.score - tightResult.score).toBeGreaterThan(5);
  });

  it('honors bucket weights after Mahalanobis scaling (weights still sum to 1.0)', () => {
    // The matcher still multiplies bucket similarities by the configured
    // weights. Assert that invariant via the total score range.
    const sig = mkSig([horizontalLineStroke()]);
    const baseline = extractAllFeatures(sig);
    const attempt = extractAllFeatures(sig);
    const result = compareFeatures(baseline, attempt);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('Threshold relaxation (transitional values during Mahalanobis rollout)', () => {
  it('AUTH_SCORE_DEFAULT is 80 (was 85)', () => {
    expect(THRESHOLDS.AUTH_SCORE_DEFAULT).toBe(80);
  });

  it('SIGNATURE_MIN_THRESHOLD is 65 (was 75)', () => {
    expect(THRESHOLDS.SIGNATURE_MIN_THRESHOLD).toBe(65);
  });

  it('SHAPE_MIN_THRESHOLD is 35 (was 40)', () => {
    expect(THRESHOLDS.SHAPE_MIN_THRESHOLD).toBe(35);
  });
});
