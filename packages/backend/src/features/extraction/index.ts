import type { AllFeatures, RawSignatureData } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractStrokes } from './helpers/stroke-parser.js';
import { extractPressureFeatures } from './pressure.js';
import { extractTimingFeatures } from './timing.js';
import { extractKinematicFeatures } from './kinematic.js';
import { extractGeometricFeatures } from './geometric.js';
import { extractDiagnosticFlags } from './diagnostic-flags.js';

/**
 * Extract all biometric features from raw signature data.
 *
 * v3 pipeline buckets (inputs to the matcher):
 *   pressure   — 7 features (null when device has no pressure)
 *   timing     — 9 features
 *   kinematic  — 6 features (NEW in v3 — velocity + acceleration)
 *   geometric  — 17 features (bbox/centroid/counts/dir-hist added in v3)
 *
 * Plus `diagnosticFlags` (3 signals) — NOT inputs to the matcher, exposed
 * alongside for fraud review and future ensemble scoring.
 */
export function extractAllFeatures(data: RawSignatureData): AllFeatures {
  const start = performance.now();
  const strokes = extractStrokes(data);

  const pressure = extractPressureFeatures(strokes);
  const timing = extractTimingFeatures(strokes);
  const kinematic = extractKinematicFeatures(strokes);
  const geometric = extractGeometricFeatures(strokes);
  const diagnosticFlags = extractDiagnosticFlags(strokes);

  const extractionTimeMs = performance.now() - start;

  return {
    pressure,
    timing,
    kinematic,
    geometric,
    diagnosticFlags,
    metadata: {
      hasPressureData: pressure !== null,
      extractionTimeMs,
      featureVersion: THRESHOLDS.FEATURE_VERSION,
    },
  };
}
