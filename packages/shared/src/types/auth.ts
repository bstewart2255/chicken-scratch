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
