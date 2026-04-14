import type { AllFeatures, RawSignatureData } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { extractStrokes } from './helpers/stroke-parser.js';
import { extractPressureFeatures } from './pressure.js';
import { extractTimingFeatures } from './timing.js';
import { extractGeometricFeatures } from './geometric.js';
import { extractSecurityFeatures } from './security.js';

/**
 * Extract all biometric features from raw signature data.
 * Orchestrates 4-phase extraction pipeline.
 */
export function extractAllFeatures(data: RawSignatureData): AllFeatures {
  const start = performance.now();
  const strokes = extractStrokes(data);

  const pressure = extractPressureFeatures(strokes);
  const timing = extractTimingFeatures(strokes);
  const geometric = extractGeometricFeatures(strokes);
  const security = extractSecurityFeatures(strokes);

  const extractionTimeMs = performance.now() - start;

  return {
    pressure,
    timing,
    geometric,
    security,
    metadata: {
      hasPressureData: pressure !== null,
      extractionTimeMs,
      featureVersion: THRESHOLDS.FEATURE_VERSION,
    },
  };
}
