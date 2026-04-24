import { describe, it, expect } from 'vitest';
import type { RawSignatureData, Stroke, StrokePoint } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { extractKinematicFeatures } from '../features/extraction/kinematic.js';
import { extractGeometricFeatures } from '../features/extraction/geometric.js';
import { extractTimingFeatures } from '../features/extraction/timing.js';
import { extractPressureFeatures } from '../features/extraction/pressure.js';
import { compareFeatures, FeatureVersionMismatchError } from '../features/comparison/biometric-score.js';

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

/** A straight horizontal line at y=50 from x=10 to x=210, 20 points, 200ms long. */
function horizontalLineStroke(): Stroke {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < 20; i++) {
    pts.push(mkPoint(10 + i * 10, 50, 1000 + i * 10));
  }
  return mkStroke(pts);
}

describe('extractAllFeatures (v3 orchestrator)', () => {
  it('returns the v3 shape with all four scored buckets + diagnosticFlags', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const f = extractAllFeatures(sig);

    expect(f.pressure).toBeNull(); // touch input, no pressure
    expect(f.timing).toBeDefined();
    expect(f.kinematic).toBeDefined();
    expect(f.geometric).toBeDefined();
    expect(f.diagnosticFlags).toBeDefined();
    expect(f.metadata.featureVersion).toBe(THRESHOLDS.FEATURE_VERSION);
    expect(f.metadata.featureVersion).toBe('3.0.0');
  });

  it('does NOT include dropped v2 fields (pressureRange / pauseDetection / spatialEfficiency / security)', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const f = extractAllFeatures(sig);

    expect((f as unknown as Record<string, unknown>).security).toBeUndefined();
    expect((f.timing as unknown as Record<string, unknown>).pauseDetection).toBeUndefined();
    expect((f.geometric as unknown as Record<string, unknown>).spatialEfficiency).toBeUndefined();
  });

  it('populates pressure bucket only when pressure has real variance (not flat defaults)', () => {
    // Pressure sweep — simulates a real stylus where pressure ramps up/down
    // across the stroke. Must be non-flat to pass the variance gate
    // (MIN_PRESSURE_VARIANCE = 0.02 in thresholds) — flat values are
    // browser-reported defaults, not biometric signal.
    const pts: StrokePoint[] = [];
    for (let i = 0; i < 20; i++) {
      const pressure = 0.3 + 0.4 * Math.sin(i * Math.PI / 19);  // ramps 0.3 → 0.7 → 0.3
      pts.push(mkPoint(10 + i * 10, 50, 1000 + i * 10, pressure));
    }
    const sig = mkSig([mkStroke(pts)]);
    const f = extractAllFeatures(sig);

    expect(f.pressure).not.toBeNull();
    expect(f.pressure!.avgPressure).toBeGreaterThan(0.3);
    expect(f.pressure!.avgPressure).toBeLessThan(0.7);
    // pressureRange removed in v3
    expect((f.pressure as unknown as Record<string, unknown>).pressureRange).toBeUndefined();
  });

  it('leaves pressure bucket null when all points have the SAME pressure (phantom trackpad default)', () => {
    // Old bug: this would trip `some pressure > 0` and populate the pressure
    // bucket with a flat value that matches every other flat-default capture
    // for free — rewarding the user 15% weight for a no-op. The variance
    // gate fixes it.
    const pts: StrokePoint[] = [];
    for (let i = 0; i < 20; i++) {
      pts.push(mkPoint(10 + i * 10, 50, 1000 + i * 10, 0.5));
    }
    const sig = mkSig([mkStroke(pts)]);
    const f = extractAllFeatures(sig);
    expect(f.pressure).toBeNull();
  });
});

describe('extractTimingFeatures', () => {
  it('computes penUpDurationMean/Std from inter-stroke gaps', () => {
    const strokeA = mkStroke([mkPoint(0, 0, 1000), mkPoint(10, 10, 1050)]);
    const strokeB = mkStroke([mkPoint(20, 20, 1200), mkPoint(30, 30, 1250)]); // 150ms gap
    const strokeC = mkStroke([mkPoint(40, 40, 1400), mkPoint(50, 50, 1450)]); // 150ms gap
    const t = extractTimingFeatures([strokeA, strokeB, strokeC]);

    expect(t.penUpDurationMean).toBeCloseTo(150);
    expect(t.penUpDurationStd).toBeCloseTo(0);
  });
});

describe('extractKinematicFeatures', () => {
  it('returns all-zero features for an empty stroke list', () => {
    const k = extractKinematicFeatures([]);
    expect(k.velocityAvg).toBe(0);
    expect(k.velocityMax).toBe(0);
    expect(k.accelerationAvg).toBe(0);
  });

  it('computes sensible velocity stats for a uniform-speed line', () => {
    const k = extractKinematicFeatures([horizontalLineStroke()]);
    // 10px every 10ms → 1 px/ms, with ~0 variance and ~0 acceleration
    expect(k.velocityAvg).toBeCloseTo(1.0, 1);
    expect(k.velocityMax).toBeCloseTo(1.0, 1);
    expect(k.velocityStd).toBeLessThan(0.1);
    expect(k.accelerationAvg).toBeLessThan(0.1);
  });

  it('detects acceleration variation in a speeding-up stroke', () => {
    const pts: StrokePoint[] = [];
    // Accelerating: step sizes grow
    let x = 0;
    for (let i = 0; i < 15; i++) {
      x += i + 1;
      pts.push(mkPoint(x, 0, 1000 + i * 10));
    }
    const k = extractKinematicFeatures([mkStroke(pts)]);
    expect(k.accelerationAvg).toBeGreaterThan(0);
    expect(k.velocityStd).toBeGreaterThan(0);
  });
});

describe('extractGeometricFeatures (v3 additions)', () => {
  it('computes bounding-box and centroid features', () => {
    const pts: StrokePoint[] = [];
    // Square-ish cloud from (0,0) to (100,50)
    for (let i = 0; i <= 10; i++) {
      pts.push(mkPoint(i * 10, 0, 1000 + i * 10));
    }
    for (let i = 0; i <= 5; i++) {
      pts.push(mkPoint(100, i * 10, 1200 + i * 10));
    }
    const g = extractGeometricFeatures([mkStroke(pts)]);
    expect(g.bboxWidth).toBe(100);
    expect(g.bboxHeight).toBe(50);
    expect(g.aspectRatio).toBe(2);
    // Centroid is normalized 0-1 within the bbox
    expect(g.centroidX).toBeGreaterThan(0);
    expect(g.centroidX).toBeLessThan(1);
    expect(g.centroidY).toBeGreaterThan(0);
    expect(g.centroidY).toBeLessThan(1);
  });

  it('direction histogram sums to ~1 for non-trivial strokes', () => {
    const g = extractGeometricFeatures([horizontalLineStroke()]);
    const hist = [
      g.directionHist0, g.directionHist1, g.directionHist2, g.directionHist3,
      g.directionHist4, g.directionHist5, g.directionHist6, g.directionHist7,
    ];
    const sum = hist.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
    // A right-moving horizontal line lives entirely in bin 0 (angle ≈ 0)
    expect(hist[0]).toBeGreaterThan(0.9);
  });

  it('populates pen-up / pen-down counts matching stroke count', () => {
    const sig = [horizontalLineStroke(), horizontalLineStroke(), horizontalLineStroke()];
    const g = extractGeometricFeatures(sig);
    expect(g.strokeCount).toBe(3);
    expect(g.penDownCount).toBe(3);
    expect(g.penUpCount).toBe(2);
  });
});

describe('extractPressureFeatures', () => {
  it('returns null when no pressure data is present', () => {
    const p = extractPressureFeatures([horizontalLineStroke()]);
    expect(p).toBeNull();
  });

  it('no longer emits pressureRange', () => {
    const pts: StrokePoint[] = [];
    for (let i = 0; i < 10; i++) {
      pts.push(mkPoint(i * 10, 0, 1000 + i * 10, 0.1 + i * 0.05));
    }
    const p = extractPressureFeatures([mkStroke(pts)])!;
    expect((p as unknown as Record<string, unknown>).pressureRange).toBeUndefined();
    expect(p.maxPressure).toBeGreaterThan(p.minPressure);
  });
});

describe('compareFeatures (v3 with version guard)', () => {
  it('throws FeatureVersionMismatchError when baseline and attempt versions differ', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const baseline = extractAllFeatures(sig);
    const attempt = extractAllFeatures(sig);
    baseline.metadata.featureVersion = '2.0.0';

    expect(() => compareFeatures(baseline, attempt)).toThrow(FeatureVersionMismatchError);
  });

  it('identical features score 100', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const baseline = extractAllFeatures(sig);
    const attempt = extractAllFeatures(sig);
    const result = compareFeatures(baseline, attempt);
    expect(result.score).toBe(100);
  });

  it('breakdown exposes the four scored buckets only (no security)', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const result = compareFeatures(extractAllFeatures(sig), extractAllFeatures(sig));
    expect(Object.keys(result.breakdown).sort()).toEqual(
      ['geometric', 'kinematic', 'pressure', 'timing'],
    );
    expect((result.breakdown as unknown as Record<string, unknown>).security).toBeUndefined();
  });

  it('exposes diagnosticFlags alongside breakdown', () => {
    const sig = mkSig([horizontalLineStroke()]);
    const result = compareFeatures(extractAllFeatures(sig), extractAllFeatures(sig));
    expect(result.diagnosticFlags).toBeDefined();
    expect(result.diagnosticFlags!.speedAnomalyScore).toBeGreaterThanOrEqual(0);
    expect(result.diagnosticFlags!.timingRegularityScore).toBeGreaterThanOrEqual(0);
    expect(result.diagnosticFlags!.behavioralAuthenticityScore).toBeGreaterThanOrEqual(0);
  });
});

describe('biometric-score bucket weights sum to 1.0', () => {
  it('with-pressure weights', () => {
    const w = THRESHOLDS.WEIGHT_WITH_PRESSURE;
    const sum = w.pressure + w.timing + w.kinematic + w.geometric;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('no-pressure weights', () => {
    const w = THRESHOLDS.WEIGHT_NO_PRESSURE;
    const sum = w.timing + w.kinematic + w.geometric;
    expect(sum).toBeCloseTo(1.0, 6);
  });
});
