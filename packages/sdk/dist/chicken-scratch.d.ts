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
