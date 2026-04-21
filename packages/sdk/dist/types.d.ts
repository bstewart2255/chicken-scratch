export interface ChickenScratchOptions {
    /**
     * Authentication credential. Either:
     * - An API key (cs_live_...) — for testing/dev only, exposed in browser
     * - An SDK token (cs_sdk_...) — recommended for production, short-lived JWT
     *
     * To get an SDK token, call POST /api/v1/sdk-token from your backend
     * with your API key, then pass the token to the SDK.
     */
    apiKey: string;
    baseUrl: string;
    container: string | HTMLElement;
    theme?: Partial<Theme>;
    /**
     * Skip the consent step in the enrollment flow.
     * Use this only if your app handles consent independently and
     * calls POST /api/v1/consent before initiating enrollment.
     * Default: false (consent step is shown).
     */
    skipConsent?: boolean;
    /**
     * Override the privacy policy URL shown in the consent step.
     * Defaults to the chickenScratch hosted policy.
     */
    privacyPolicyUrl?: string;
    onStepChange?: (step: StepInfo) => void;
    onComplete?: (result: AuthResult) => void;
    onError?: (error: Error) => void;
}
export interface Theme {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    canvasBorderColor: string;
    successColor: string;
    failColor: string;
    fontFamily: string;
}
export interface StepInfo {
    type: 'enroll' | 'verify';
    step: string;
    current: number;
    total: number;
    label: string;
}
export interface AuthResult {
    success: boolean;
    authenticated?: boolean;
    enrolled?: boolean;
    message: string;
    /**
     * Short-lived signed token returned by the chickenScratch backend on
     * successful verification. Pass this to your own backend so it can
     * validate the attestation server-to-server via
     * POST /api/v1/attestation/verify. Don't trust `authenticated: true`
     * alone — the browser could lie; the attestation is what your
     * backend should gate privileged actions on.
     */
    attestationToken?: string;
    /**
     * Machine-readable error code when success=false. E.g.
     * `DEVICE_CLASS_MISMATCH` — the user is trying to verify on a device
     * class they haven't enrolled. Present alongside `enrolledClasses`.
     */
    errorCode?: string;
    /**
     * Classes the user already has baselines for (mobile / desktop).
     * Present with DEVICE_CLASS_MISMATCH so you can render "switch device"
     * or "add this device" UI.
     */
    enrolledClasses?: string[];
}
export interface StrokePoint {
    x: number;
    y: number;
    pressure: number;
    timestamp: number;
    tiltX?: number;
    tiltY?: number;
}
export interface Stroke {
    points: StrokePoint[];
    startTime: number;
    endTime: number;
}
export interface RawSignatureData {
    strokes: Stroke[];
    canvasSize: {
        width: number;
        height: number;
    };
    deviceCapabilities: DeviceCapabilities;
    capturedAt: string;
}
export interface DeviceCapabilities {
    supportsPressure: boolean;
    supportsTouch: boolean;
    inputMethod: 'mouse' | 'touch' | 'stylus';
    browser: string;
    os: string;
    fingerprint?: DeviceFingerprint;
}
export interface DeviceFingerprint {
    canvasHash: string;
    webglRenderer: string;
    webglVendor: string;
    screenWidth: number;
    screenHeight: number;
    devicePixelRatio: number;
    maxTouchPoints: number;
    hardwareConcurrency: number;
    deviceMemory: number | null;
    timezone: string;
    language: string;
    languages: string[];
    platform: string;
    colorDepth: number;
    userAgent: string;
}
export interface ChallengeResponse {
    challengeId: string;
    shapeOrder: string[];
    expiresAt: string;
}
