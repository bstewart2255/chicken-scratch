import { describe, it, expect } from 'vitest';
import type { Stroke, StrokePoint } from '@chicken-scratch/shared';
import { hasPressureData } from '../features/extraction/helpers/stroke-parser.js';

function mkStroke(pressures: number[]): Stroke {
  const points: StrokePoint[] = pressures.map((p, i) => ({
    x: i * 10,
    y: i * 5,
    pressure: p,
    timestamp: 1000 + i * 10,
  }));
  return {
    points,
    startTime: points[0]?.timestamp ?? 0,
    endTime: points[points.length - 1]?.timestamp ?? 0,
  };
}

describe('hasPressureData (variance-gated)', () => {
  it('returns false when all pressures are zero (finger touch, no pressure)', () => {
    const strokes = [mkStroke([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])];
    expect(hasPressureData(strokes)).toBe(false);
  });

  it('returns false when all pressures are a flat non-zero default (trackpad Safari, ~0.5)', () => {
    const strokes = [mkStroke([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])];
    expect(hasPressureData(strokes)).toBe(false);
  });

  it('returns false when pressures have tiny variance below the variance floor', () => {
    // Simulates a browser that reports ~0.5 with imperceptible floating-point noise
    const strokes = [mkStroke([0.50, 0.501, 0.499, 0.500, 0.501, 0.500, 0.499])];
    expect(hasPressureData(strokes)).toBe(false);
  });

  it('returns true when pressures have meaningful variance (real stylus)', () => {
    // Apple Pencil: pressure ramps up then down across the stroke
    const strokes = [mkStroke([0.1, 0.3, 0.5, 0.7, 0.8, 0.7, 0.5, 0.3, 0.1])];
    expect(hasPressureData(strokes)).toBe(true);
  });

  it('returns true for a full-range pressure sweep', () => {
    const strokes = [mkStroke([0.0, 0.2, 0.4, 0.6, 0.8, 1.0])];
    expect(hasPressureData(strokes)).toBe(true);
  });

  it('returns false on empty stroke list', () => {
    expect(hasPressureData([])).toBe(false);
  });

  it('returns false when strokes have no points', () => {
    expect(hasPressureData([{ points: [], startTime: 0, endTime: 0 }])).toBe(false);
  });

  it('checks variance across ALL strokes, not per-stroke', () => {
    // Two strokes, each flat, but different flat values between strokes.
    // Variance is across the combined pressures, so this should qualify
    // even if neither stroke alone does.
    const strokes = [mkStroke([0.3, 0.3, 0.3]), mkStroke([0.7, 0.7, 0.7])];
    expect(hasPressureData(strokes)).toBe(true);
  });
});
