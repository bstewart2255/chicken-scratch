import type { ChickenScratchOptions, AuthResult } from './types.js';
export declare class ChickenScratch {
    private api;
    private container;
    private options;
    private deviceCaps;
    constructor(options: ChickenScratchOptions);
    /**
     * Run the full enrollment flow for a user.
     * Renders the multi-step UI (3 signatures + 5 shapes) inside the container.
     * Returns when enrollment is complete or the user cancels.
     */
    enroll(externalUserId: string): Promise<AuthResult>;
    /**
     * Run the full verification flow for a user.
     * Renders the multi-step UI (1 signature + shapes in challenge order) inside the container.
     * Returns pass/fail result.
     */
    verify(externalUserId: string): Promise<AuthResult>;
    /**
     * Check if a user is enrolled.
     */
    isEnrolled(externalUserId: string): Promise<boolean>;
    /**
     * Full enrollment status including `enrolledClasses` — which device classes
     * ('mobile', 'desktop') this user has a baseline on. Useful for pre-flighting
     * verify flows: if the current browsing device's class isn't in the list,
     * surface "wrong device" immediately rather than making the user draw
     * through the whole flow before the server bounces them.
     */
    getEnrollmentInfo(externalUserId: string): Promise<{
        externalUserId: string;
        enrolled: boolean;
        samplesCollected: number;
        samplesRequired: number;
        shapesEnrolled: string[];
        shapesRequired: string[];
        enrolledClasses?: string[];
    }>;
    /**
     * Detect the current device's class ('mobile' | 'desktop') using the same
     * rule the server applies to incoming biometric data: touchscreens →
     * 'mobile', everything else → 'desktop'. Matches server's detectDeviceClass
     * after the stylus-misclassification fix — touchscreen presence is the
     * single authoritative signal for the "which device am I holding" heuristic.
     */
    detectMyDeviceClass(): 'mobile' | 'desktop';
    /**
     * Create a mobile-handoff verify session. Symmetric to
     * `createMobileEnrollSession`, but for verify: user enrolled on their
     * phone, now they're on their laptop needing to recover, and the
     * biometric signal from a mouse/trackpad isn't interchangeable with the
     * one from finger-touch — so route them back to their phone.
     *
     * `waitForCompletion()` resolves with an AuthResult that includes an
     * `attestationToken` when verify succeeds on mobile. The token is minted
     * server-side when the session is marked complete (see
     * `session.service.completeSession`). Customers pass this token back
     * to their own backend for server-to-server validation via
     * `POST /api/v1/attestation/verify` before acting on the "verified"
     * state (e.g. password reset).
     */
    createMobileVerifySession(externalUserId: string): Promise<{
        sessionId: string;
        url: string;
        expiresAt: string;
        waitForCompletion: (options?: {
            pollIntervalMs?: number;
            signal?: AbortSignal;
        }) => Promise<AuthResult>;
    }>;
    /**
     * Create a mobile-handoff enrollment session. Returns the URL to encode
     * as a QR code + a `waitForCompletion()` helper that polls the session
     * status until the user finishes on mobile (or times out).
     *
     * The SDK returns primitives rather than rendering a modal so the host
     * app can style the QR UX however it wants. Example integration:
     *
     *     const { url, waitForCompletion } = await cs.createMobileEnrollSession(userId);
     *     // render `url` as QR inside your own modal
     *     const result = await waitForCompletion();
     *     if (result.enrolled) { ... }
     *
     * The `type` parameter currently supports 'enroll' only in the demo-app
     * integration path; 'verify' is wired backend-side for future use.
     */
    createMobileEnrollSession(externalUserId: string): Promise<{
        sessionId: string;
        url: string;
        expiresAt: string;
        waitForCompletion: (options?: {
            pollIntervalMs?: number;
            signal?: AbortSignal;
        }) => Promise<AuthResult>;
    }>;
    /**
     * Wait for the user to draw something and click submit.
     * Returns a promise that resolves with the stroke data.
     */
    private waitForDrawing;
}
