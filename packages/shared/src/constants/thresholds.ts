/** The current version of the chickenScratch biometric data privacy policy. */
export const CURRENT_POLICY_VERSION = '1.0' as const;

/** URL where the full privacy policy is hosted. */
export const PRIVACY_POLICY_URL = 'https://chickenscratch.io/privacy' as const;

export const THRESHOLDS = {
  // Authentication
  AUTH_SCORE_DEFAULT: 85,
  ENROLLMENT_SAMPLES_REQUIRED: 3,

  // Temporal (ms)
  PAUSE_DETECTION_MS: 50,
  DWELL_TIME_MS: 20,
  UNNATURAL_PAUSE_MS: 100,

  // Spatial (px)
  DWELL_DISTANCE_PX: 5,
  OVERLAP_DISTANCE_PX: 5,

  // Angular (radians)
  TREMOR_ANGLE_RAD: Math.PI / 6,
  DIRECTION_CHANGE_ANGLE_RAD: Math.PI / 4,

  // Anomaly detection (diagnostic flags — not inputs to the matcher)
  SPEED_ANOMALY_THRESHOLD: 0.05,
  PRESSURE_ANOMALY_THRESHOLD: 0.5,

  // Feature extraction
  // Bumped to 3.0.0: dropped pressureRange/pauseDetection/spatialEfficiency,
  // demoted security features to diagnosticFlags, added kinematic bucket
  // + bbox/centroid/pen-counts/crit-points/direction-histogram + penUpDuration
  // stats. Runtime guard in compareFeatures() rejects cross-version compares.
  FEATURE_VERSION: '3.0.0',

  // Biometric-score bucket weights (sum to 1.0 in each branch).
  // Priors — need empirical calibration on real enrollments (see
  // docs/scoring-research.md section 4). Pressure bucket is dropped entirely
  // for captures without pressure data; remaining buckets renormalize.
  WEIGHT_WITH_PRESSURE: {
    pressure: 0.15,
    timing: 0.20,
    kinematic: 0.25,
    geometric: 0.40,
  },
  WEIGHT_NO_PRESSURE: {
    timing: 0.25,
    kinematic: 0.30,
    geometric: 0.45,
  },

  // Kinematic extraction tuning
  // Smoothing window for velocity/acceleration derivatives. Too small
  // amplifies per-sample jitter; too large blurs real kinematic signal.
  KINEMATIC_SMOOTH_WINDOW: 3,
  // How many of the first N points of each stroke count as "pen-down" for
  // velocityAtPenDown averaging. Literature typically uses the first 3-5.
  PEN_DOWN_WINDOW_POINTS: 5,

  // Shape scoring
  SIGNATURE_WEIGHT: 0.7,
  SHAPE_WEIGHT: 0.3,
  SHAPE_BIOMETRIC_WEIGHT: 0.7,
  SHAPE_SPECIFIC_WEIGHT: 0.3,
  SHAPE_MIN_THRESHOLD: 40,
  SIGNATURE_MIN_THRESHOLD: 75,

  // Drawing scoring (now with shape-specific features)
  DRAWING_MIN_THRESHOLD: 40,
  DRAWING_BIOMETRIC_WEIGHT: 0.7,
  DRAWING_SPECIFIC_WEIGHT: 0.3,

  // Shape detection
  CORNER_DETECTION_ANGLE_RAD: Math.PI / 4,
  CORNER_WINDOW: 5,
  CORNER_THRESHOLD_SQUARE: Math.PI / 3,

  // Sessions
  SESSION_TTL_MS: 5 * 60 * 1000, // 5 minutes

  // Enrollment quality gates
  QUALITY_MIN_POINTS: 20,         // minimum total data points across all strokes
  QUALITY_MIN_DURATION_MS: 200,   // minimum drawing duration (anti-replay/bot)
  QUALITY_MIN_BBOX_PX: 30,        // bounding box must be at least 30px in one dimension

  // Lockout
  LOCKOUT_WINDOW_MS: 15 * 60 * 1000,   // sliding window to count failures
  LOCKOUT_MAX_FAILURES: 5,              // failures within window before lockout
  LOCKOUT_DURATION_MS: 30 * 60 * 1000, // how long the lockout lasts

  // Rate limits (per tenant, in-memory)
  RATE_VERIFY_MAX: 60,     // max verify calls per window
  RATE_ENROLL_MAX: 30,     // max enroll calls per window
  RATE_WINDOW_MS: 60_000,  // 1-minute rolling window

  // Demo mode (reduced requirements for landing page try-it-out)
  DEMO_ENROLLMENT_SAMPLES: 1,
  DEMO_SESSION_TTL_MS: 10 * 60 * 1000, // 10 minutes
} as const;

/** Demo challenge types: 1 shape + 1 drawing */
export const DEMO_CHALLENGE_TYPES = ['circle', 'house'] as const;

export type Thresholds = typeof THRESHOLDS;
