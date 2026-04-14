export interface PressureFeatures {
  avgPressure: number;
  maxPressure: number;
  minPressure: number;
  pressureStd: number;
  pressureRange: number;
  contactTimeRatio: number;
  pressureBuildupRate: number;
  pressureReleaseRate: number;
}

export interface TimingFeatures {
  pauseDetection: number;
  rhythmConsistency: number;
  tempoVariation: number;
  dwellTimePatterns: number;
  interStrokeTiming: number;
  drawingDurationTotal: number;
  pauseTimeRatio: number;
  avgStrokeDuration: number;
}

export interface GeometricFeatures {
  strokeComplexity: number;
  tremorIndex: number;
  smoothnessIndex: number;
  directionChanges: number;
  curvatureAnalysis: number;
  spatialEfficiency: number;
  strokeOverlapRatio: number;
}

export interface SecurityFeatures {
  speedAnomalyScore: number;
  timingRegularityScore: number;
  behavioralAuthenticityScore: number;
}

export interface AllFeatures {
  pressure: PressureFeatures | null; // null when device doesn't support pressure
  timing: TimingFeatures;
  geometric: GeometricFeatures;
  security: SecurityFeatures;
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
  score: number; // 0-100
  breakdown: {
    pressure: number | null;
    timing: number;
    geometric: number;
    security: number;
  };
}
