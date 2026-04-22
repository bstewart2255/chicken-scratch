import type { RawSignatureData, ChallengeResponse } from './types.js';
/**
 * Thrown by the SDK's internal API calls when the chickenScratch backend
 * returns a non-success response. Preserves the machine-readable errorCode
 * and any extra fields (e.g. enrolledClasses on DEVICE_CLASS_MISMATCH,
 * retryAfterSeconds on RATE_LIMITED/LOCKED_OUT) so callers can branch.
 */
export declare class ChickenScratchApiError extends Error {
    readonly statusCode: number;
    readonly errorCode: string | undefined;
    readonly details: Record<string, unknown>;
    constructor(message: string, statusCode: number, errorCode: string | undefined, details: Record<string, unknown>);
}
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
        /**
         * Which device classes this user has enrolled on ('mobile', 'desktop',
         * or both). Use to pre-flight verify flows: if the browsing device's
         * class isn't in this list, surface "wrong device" immediately instead
         * of making the user draw through the full verify flow first.
         * Optional for back-compat with older backends that didn't include it.
         */
        enrolledClasses?: string[];
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
    /**
     * Create a short-lived mobile handoff session. Returned `url` encodes a
     * session ID that the user scans as a QR code on their phone — the
     * main-frontend /mobile/<id> page handles the capture flow there. Caller
     * polls `getMobileSessionStatus()` to detect completion.
     *
     * Intended for desktop → mobile enrollment handoff, where the customer's
     * user is signing up on a laptop and we want the richer biometric signal
     * a phone produces (real touch position data instead of trackpad cursor
     * events, richer kinematics).
     */
    createMobileSession(externalUserId: string, type: 'enroll' | 'verify'): Promise<{
        success: boolean;
        sessionId: string;
        url: string;
        expiresAt: string;
    }>;
    /**
     * Poll a mobile handoff session's status. Returns `status`: `'pending'`
     * while waiting for the user to open the link, `'in_progress'` while
     * they're capturing, `'completed'` when done (with `result` blob), or
     * `'expired'` past TTL (5 min).
     */
    getMobileSessionStatus(sessionId: string): Promise<{
        success: boolean;
        status: "pending" | "in_progress" | "completed" | "expired";
        result: Record<string, unknown> | null;
        expiresAt: string;
    }>;
}
