import type { RawSignatureData } from './stroke.js';
import type { FeatureComparison } from './features.js';

/**
 * Device class — the biometric signal differs enough between touch input
 * (finger on phone/tablet) and pointer input (mouse/trackpad/stylus) that
 * a baseline enrolled on one cannot reliably verify the other. Users can
 * enroll on multiple classes to unlock verification on either.
 */
export type DeviceClass = 'mobile' | 'desktop';

export const ALL_DEVICE_CLASSES: readonly DeviceClass[] = ['mobile', 'desktop'] as const;

/**
 * How long after a successful verify on an existing class the user may
 * enroll a new class without re-authenticating. Short window so stolen
 * sessions can't trivially add a device. Extended via customer opt-out
 * flag (`skipRecentVerify: true` in the enrollment payload).
 */
export const ADD_DEVICE_RECENT_VERIFY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Machine-readable error codes returned alongside human-readable messages
 * on every tenant-API error response. Customers branch UX logic on these,
 * not on the message text (which may change). New codes may be added; the
 * client should handle unknown codes gracefully (treat as generic failure).
 */
export type TenantApiErrorCode =
  // Request shape problems
  | 'MISSING_FIELD'            // required field absent from request body
  | 'INVALID_REQUEST'          // validation failed (wrong types, bad schema)
  // Authentication / authorization
  | 'UNAUTHORIZED'             // API key / SDK token missing, invalid, or expired
  | 'FORBIDDEN'                // authenticated but not allowed (wrong auth method for endpoint, etc.)
  // User state
  | 'USER_NOT_FOUND'           // externalUserId has no record
  | 'NOT_ENROLLED'             // user has no baselines; cannot verify
  | 'ALREADY_ENROLLED'         // same-class re-enrollment attempted
  // Consent
  | 'CONSENT_REQUIRED'         // user has not recorded consent (or has withdrawn)
  // Rate limiting & lockout
  | 'RATE_LIMITED'             // too many requests against the rate-limit window
  | 'LOCKED_OUT'               // user exceeded failed-attempt threshold
  // Enrollment quality
  | 'QUALITY_GATE_FAILED'      // signature sample too short, too small, or too few points
  // Multi-device
  | 'DEVICE_CLASS_MISMATCH'    // verify attempted on a class the user hasn't enrolled
  | 'RECENT_VERIFY_REQUIRED'   // add-device gate: user must verify on an existing class first
  // Attestation
  | 'INVALID_ATTESTATION'      // token forged, expired, or malformed
  | 'ATTESTATION_TENANT_MISMATCH'; // token valid but minted for a different tenant

export interface EnrollmentRequest {
  username: string;
  signatureData: RawSignatureData;
}

export interface EnrollmentResponse {
  success: boolean;
  userId: string;
  sampleNumber: number;
  samplesRemaining: number;
  enrolled: boolean;
  message: string;
}

export interface EnrollmentStatusResponse {
  username: string;
  enrolled: boolean;
  samplesCollected: number;
  samplesRequired: number;
}

export interface VerifyRequest {
  username: string;
  signatureData: RawSignatureData;
}

export interface VerifyResponse {
  success: boolean;
  score: number;
  threshold: number;
  authenticated: boolean;
  comparison: FeatureComparison;
  message: string;
}
