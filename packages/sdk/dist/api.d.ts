import type { RawSignatureData, ChallengeResponse } from './types.js';
export declare class ApiClient {
    private baseUrl;
    private apiKey;
    constructor(baseUrl: string, apiKey: string);
    private request;
    getEnrollmentStatus(externalUserId: string): Promise<{
        externalUserId: string;
        enrolled: boolean;
        samplesCollected: number;
        samplesRequired: number;
        shapesEnrolled: string[];
        shapesRequired: string[];
    }>;
    enroll(externalUserId: string, signatureData: RawSignatureData): Promise<{
        success: boolean;
        externalUserId: string;
        sampleNumber: number;
        samplesRemaining: number;
        enrolled: boolean;
        message: string;
    }>;
    enrollShape(externalUserId: string, shapeType: string, signatureData: RawSignatureData): Promise<{
        success: boolean;
        externalUserId: string;
        message: string;
    }>;
    getChallenge(externalUserId: string): Promise<ChallengeResponse>;
    getConsentStatus(externalUserId: string): Promise<{
        externalUserId: string;
        hasConsented: boolean;
        policyVersion: string | null;
        consentedAt: string | null;
        isCurrentVersion: boolean;
    }>;
    recordConsent(externalUserId: string, policyVersion: string): Promise<{
        success: boolean;
        message: string;
        consentedAt: string;
    }>;
    verifyFull(body: {
        externalUserId: string;
        signatureData: RawSignatureData;
        shapes: {
            shapeType: string;
            signatureData: RawSignatureData;
        }[];
        challengeId: string;
        durationMs?: number;
        stepDurations?: {
            step: string;
            durationMs: number;
        }[];
    }): Promise<{
        success: boolean;
        authenticated: boolean;
        message: string;
    }>;
}
