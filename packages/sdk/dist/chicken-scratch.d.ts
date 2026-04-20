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
     * Wait for the user to draw something and click submit.
     * Returns a promise that resolves with the stroke data.
     */
    private waitForDrawing;
}
