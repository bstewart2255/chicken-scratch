import type { RawSignatureData } from './stroke.js';
import type { FeatureComparison } from './features.js';

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
