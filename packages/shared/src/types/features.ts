export interface PressureFeatures {
  avgPressure: number;
  maxPressure: number;
  minPressure: number;
  pressureStd: number;
  // `pressureRange` removed in v3 — fully redundant with max - min.
  contactTimeRatio: number;
  pressureBuildupRate: number;
  pressureReleaseRate: number;
}

export interface TimingFeatures {
  // `pauseDetection` (count) removed in v3 — redundant with pauseTimeRatio.
  rhythmConsistency: number;
  tempoVariation: number;
  dwellTimePatterns: number;
  interStrokeTiming: number;
  drawingDurationTotal: number;
  pauseTimeRatio: number;
  avgStrokeDuration: number;
  penUpDurationMean: number;  // v3 NEW — mean pen-up (inter-stroke) duration
  penUpDurationStd: number;   // v3 NEW — stddev of pen-up durations
}

export interface KinematicFeatures {
  // v3 NEW bucket — velocity + acceleration across the full trace.
  velocityAvg: number;
  velocityMax: number;
  velocityStd: number;
  velocityAtPenDown: number;  // velocity near the start of each stroke, averaged
  accelerationAvg: number;
  accelerationMax: number;
}

export interface GeometricFeatures {
  strokeComplexity: number;
  tremorIndex: number;
  smoothnessIndex: number;
  directionChanges: number;
  curvatureAnalysis: number;
  // `spatialEfficiency` removed in v3 — replaced with explicit bbox features below.
  strokeOverlapRatio: number;
  // v3 NEW — bounding-box geometry
  bboxWidth: number;
  bboxHeight: number;
  aspectRatio: number;
  centroidX: number;          // normalized to bbox: 0=left, 1=right
  centroidY: number;          // normalized to bbox: 0=top, 1=bottom
  // v3 NEW — stroke structure counts
  strokeCount: number;
  penDownCount: number;       // same as strokeCount; retained for literature alignment
  penUpCount: number;         // strokeCount - 1 for normal input
  // v3 NEW — critical points (local velocity minima)
  criticalPointCount: number;
  // v3 NEW — 8-bin direction histogram (fraction of trajectory time per direction bin)
  directionHist0: number;     // 0° (+X / right)
  directionHist1: number;     // 45°
  directionHist2: number;     // 90° (+Y / down)
  directionHist3: number;     // 135°
  directionHist4: number;     // 180° (-X / left)
  directionHist5: number;     // 225°
  directionHist6: number;     // 270° (-Y / up)
  directionHist7: number;     // 315°
}

/**
 * Diagnostic flags derived from stroke kinematics that are useful for
 * anomaly inspection / fraud review but NOT inputs to the biometric score.
 *
 * Previously packaged as `SecurityFeatures` and included in the matcher
 * feature vector; demoted in v3 because these are derived meta-scores
 * (computed from the same timing/velocity signal that already feeds
 * timing + kinematic buckets) and were double-counting that information.
 */
export interface DiagnosticFlags {
  speedAnomalyScore: number;
  timingRegularityScore: number;
  behavioralAuthenticityScore: number;
}

export interface AllFeatures {
  pressure: PressureFeatures | null; // null when device doesn't support pressure
  timing: TimingFeatures;
  kinematic: KinematicFeatures;
  geometric: GeometricFeatures;
  diagnosticFlags: DiagnosticFlags;
  metadata: {
    hasPressureData: boolean;
    extractionTimeMs: number;
    featureVersion: string;
  };
}

export interface MLFeatureVector {
  strokeCount: number;
  totalPoints: number;
  totalDurationMs: number;
  avgPointsPerStroke: number;
  avgVelocity: number;
  maxVelocity: number;
  minVelocity: number;
  velocityStd: number;
  width: number;
  height: number;
  area: number;
  aspectRatio: number;
  centerX: number;
  centerY: number;
  avgStrokeLength: number;
  totalLength: number;
  lengthVariation: number;
  avgStrokeDuration: number;
  durationVariation: number;
}

export interface FeatureComparison {
  score: number; // 0-100 — final fused score (or feature-only when DTW unavailable)
  breakdown: {
    pressure: number | null;
    timing: number;
    kinematic: number;
    geometric: number;
    // `security` removed in v3; see `diagnosticFlags` for anomaly signals.
  };
  diagnosticFlags?: DiagnosticFlags;
  /**
   * DTW-based sequence-match score (0-100), aggregated as best-of-N across
   * the user's enrolled stroke samples. Optional: undefined when the
   * matcher had no enrollment samples to compare against (e.g. a pre-PR#3
   * baseline that was never re-enrolled). See THRESHOLDS.DTW_FUSION_WEIGHT
   * for how it's combined with the feature-based score.
   */
  dtwScore?: number;
  /**
   * Per-sample DTW similarities, one per enrolled stroke sample. Useful for
   * diagnostics ("which enrollment did the attempt resemble?"). Omitted
   * when DTW isn't computed.
   */
  dtwScores?: number[];
  /**
   * Pure feature-based score (0-100) before DTW fusion. Same value as
   * `score` when DTW is unavailable. Exposed so diagnostics can show the
   * two components separately and the fused total.
   */
  featureScore?: number;
}
