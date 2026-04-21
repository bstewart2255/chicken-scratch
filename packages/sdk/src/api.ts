import type { RawSignatureData, ChallengeResponse } from './types.js';

/**
 * Thrown by the SDK's internal API calls when the chickenScratch backend
 * returns a non-success response. Preserves the machine-readable errorCode
 * and any extra fields (e.g. enrolledClasses on DEVICE_CLASS_MISMATCH,
 * retryAfterSeconds on RATE_LIMITED/LOCKED_OUT) so callers can branch.
 */
export class ChickenScratchApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string | undefined;
  readonly details: Record<string, unknown>;

  constructor(message: string, statusCode: number, errorCode: string | undefined, details: Record<string, unknown>) {
    super(message);
    this.name = 'ChickenScratchApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    // SDK tokens use Authorization: Bearer, API keys use X-API-Key
    const authHeaders: Record<string, string> = this.apiKey.startsWith('cs_sdk_')
      ? { 'Authorization': `Bearer ${this.apiKey}` }
      : { 'X-API-Key': this.apiKey };

    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      ...options,
    });
    const data = await res.json();
    if (!res.ok && !data.success) {
      throw new ChickenScratchApiError(
        data.error || data.message || `Request failed: ${res.status}`,
        res.status,
        typeof data.errorCode === 'string' ? data.errorCode : undefined,
        data as Record<string, unknown>,
      );
    }
    return data as T;
  }

  async getEnrollmentStatus(externalUserId: string) {
    return this.request<{
      externalUserId: string;
      enrolled: boolean;
      samplesCollected: number;
      samplesRequired: number;
      shapesEnrolled: string[];
      shapesRequired: string[];
    }>(`/api/v1/enroll/${encodeURIComponent(externalUserId)}/status`);
  }

  async enroll(externalUserId: string, signatureData: RawSignatureData) {
    return this.request<{
      success: boolean;
      externalUserId: string;
      sampleNumber: number;
      samplesRemaining: number;
      enrolled: boolean;
      message: string;
    }>('/api/v1/enroll', {
      method: 'POST',
      body: JSON.stringify({ externalUserId, signatureData }),
    });
  }

  async enrollShape(externalUserId: string, shapeType: string, signatureData: RawSignatureData) {
    return this.request<{
      success: boolean;
      externalUserId: string;
      message: string;
    }>('/api/v1/enroll/shape', {
      method: 'POST',
      body: JSON.stringify({ externalUserId, shapeType, signatureData }),
    });
  }

  async getChallenge(externalUserId: string): Promise<ChallengeResponse> {
    return this.request<ChallengeResponse>('/api/v1/challenge', {
      method: 'POST',
      body: JSON.stringify({ externalUserId }),
    });
  }

  async getConsentStatus(externalUserId: string) {
    return this.request<{
      externalUserId: string;
      hasConsented: boolean;
      policyVersion: string | null;
      consentedAt: string | null;
      isCurrentVersion: boolean;
    }>(`/api/v1/consent/${encodeURIComponent(externalUserId)}`);
  }

  async recordConsent(externalUserId: string, policyVersion: string) {
    return this.request<{
      success: boolean;
      message: string;
      consentedAt: string;
    }>('/api/v1/consent', {
      method: 'POST',
      body: JSON.stringify({ externalUserId, policyVersion }),
    });
  }

  async verifyFull(body: {
    externalUserId: string;
    signatureData: RawSignatureData;
    shapes: { shapeType: string; signatureData: RawSignatureData }[];
    challengeId: string;
    durationMs?: number;
    stepDurations?: { step: string; durationMs: number }[];
  }) {
    return this.request<{
      success: boolean;
      authenticated: boolean;
      message: string;
    }>('/api/v1/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
