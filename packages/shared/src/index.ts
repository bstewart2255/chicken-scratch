// Types
export type {
  StrokePoint,
  Stroke,
  CanvasSize,
  RawSignatureData,
  DeviceCapabilities,
  DeviceFingerprint,
} from './types/stroke.js';

export type {
  PressureFeatures,
  TimingFeatures,
  GeometricFeatures,
  SecurityFeatures,
  AllFeatures,
  MLFeatureVector,
  FeatureComparison,
} from './types/features.js';

export type {
  EnrollmentRequest,
  EnrollmentResponse,
  EnrollmentStatusResponse,
  VerifyRequest,
  VerifyResponse,
  DeviceClass,
} from './types/auth.js';
export { ALL_DEVICE_CLASSES, ADD_DEVICE_RECENT_VERIFY_WINDOW_MS } from './types/auth.js';

export type {
  ShapeType,
  DrawingType,
  ChallengeItemType,
  CircleFeatures,
  SquareFeatures,
  TriangleFeatures,
  HouseFeatures,
  SmileyFeatures,
  ShapeSpecificFeatures,
  ShapeEnrollmentRequest,
  ShapeData,
  FullVerifyRequest,
  ShapeScoreBreakdown,
  FullVerifyResponse,
} from './types/shape.js';
export { SHAPE_TYPES, DRAWING_TYPES, ALL_CHALLENGE_TYPES, isDrawingType } from './types/shape.js';

export type {
  SessionType,
  SessionStatus,
  Session,
  CreateSessionRequest,
  CreateSessionResponse,
  ChallengeResponse,
} from './types/session.js';

export type {
  StepDuration,
  DiagnosticsAttempt,
  ShapeAttemptDetail,
  UserStats,
  DiagnosticsUser,
  BaselineSummary,
  FingerprintMatchResult,
  FingerprintSignalInfo,
  ForgeryLevel,
  ForgeryTrialResult,
  ForgeryLevelResult,
  ForgerySimulationResult,
} from './types/diagnostics.js';

// Constants
export { THRESHOLDS, DEMO_CHALLENGE_TYPES, CURRENT_POLICY_VERSION, PRIVACY_POLICY_URL } from './constants/thresholds.js';

// Validation
export {
  EnrollmentRequestSchema,
  VerifyRequestSchema,
  ShapeEnrollmentRequestSchema,
  FullVerifyRequestSchema,
  CreateSessionRequestSchema,
} from './validation/schemas.js';
