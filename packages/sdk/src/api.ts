import type { RawSignatureData, ChallengeResponse } from './types.js';

export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      ...options,
    });
    const data = await res.json();
    if (!res.ok && !data.success) {
      throw new Error(data.error || data.message || `Request failed: ${res.status}`);
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
