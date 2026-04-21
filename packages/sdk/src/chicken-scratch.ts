import type { ChickenScratchOptions, AuthResult, RawSignatureData, DeviceCapabilities } from './types.js';
import { ApiClient, ChickenScratchApiError } from './api.js';
import { DrawingCanvas } from './canvas.js';
import { UIRenderer, SHAPE_LABELS } from './ui.js';
import { detectCapabilities } from './device.js';

const CURRENT_POLICY_VERSION = '1.0';
const DEFAULT_PRIVACY_URL = 'https://chicken-scratch-production.up.railway.app/privacy';

export class ChickenScratch {
  private api: ApiClient;
  private container: HTMLElement;
  private options: ChickenScratchOptions;
  private deviceCaps: DeviceCapabilities;

  constructor(options: ChickenScratchOptions) {
    this.options = options;
    this.api = new ApiClient(options.baseUrl, options.apiKey);

    if (typeof options.container === 'string') {
      const el = document.querySelector(options.container);
      if (!el) throw new Error(`Container not found: ${options.container}`);
      this.container = el as HTMLElement;
    } else {
      this.container = options.container;
    }

    this.deviceCaps = detectCapabilities();
  }

  /**
   * Run the full enrollment flow for a user.
   * Renders the multi-step UI (3 signatures + 5 shapes) inside the container.
   * Returns when enrollment is complete or the user cancels.
   */
  async enroll(externalUserId: string): Promise<AuthResult> {
    try {
      // Check current status
      const status = await this.api.getEnrollmentStatus(externalUserId);
      if (status.enrolled) {
        return { success: true, enrolled: true, message: 'User is already enrolled.' };
      }

      // Consent step (shown before any biometric data is collected)
      if (!this.options.skipConsent) {
        const consentStatus = await this.api.getConsentStatus(externalUserId);
        if (!consentStatus.hasConsented) {
          const privacyUrl = this.options.privacyPolicyUrl ?? DEFAULT_PRIVACY_URL;
          const ui = new UIRenderer(this.container, this.options.theme);
          const agreed = await ui.showConsent(privacyUrl);
          if (!agreed) {
            return { success: false, enrolled: false, message: 'Enrollment requires consent to biometric data collection.' };
          }
          // Record consent on the backend
          await this.api.recordConsent(externalUserId, CURRENT_POLICY_VERSION);
        }
      }

      const sigSamplesNeeded = status.samplesRequired - status.samplesCollected;
      const shapesNeeded = status.shapesRequired.filter(s => !status.shapesEnrolled.includes(s));
      const totalSteps = sigSamplesNeeded + shapesNeeded.length;

      const ui = new UIRenderer(this.container, this.options.theme);
      const canvas = new DrawingCanvas(ui.getCanvasContainer());

      let currentStep = 0;

      // Signature samples
      for (let i = 0; i < sigSamplesNeeded; i++) {
        currentStep++;
        const sampleNum = status.samplesCollected + i + 1;
        ui.setStep(
          `Sign your name (${sampleNum} of ${status.samplesRequired})`,
          currentStep,
          totalSteps,
        );
        this.options.onStepChange?.({
          type: 'enroll',
          step: `signature-${sampleNum}`,
          current: currentStep,
          total: totalSteps,
          label: `Signature ${sampleNum} of ${status.samplesRequired}`,
        });

        const sigData = await this.waitForDrawing(ui, canvas);
        await this.api.enroll(externalUserId, sigData);
      }

      // Shape samples
      for (const shapeType of shapesNeeded) {
        currentStep++;
        const label = SHAPE_LABELS[shapeType] || `Draw: ${shapeType}`;
        ui.setStep(label, currentStep, totalSteps);
        this.options.onStepChange?.({
          type: 'enroll',
          step: shapeType,
          current: currentStep,
          total: totalSteps,
          label,
        });

        const shapeData = await this.waitForDrawing(ui, canvas);
        await this.api.enrollShape(externalUserId, shapeType, shapeData);
      }

      const result: AuthResult = { success: true, enrolled: true, message: 'Enrollment complete!' };
      ui.showResult(true, result.message);
      this.options.onComplete?.(result);
      canvas.destroy();
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      // Propagate errorCode + details (e.g. RECENT_VERIFY_REQUIRED +
      // enrolledClasses) so callers can render the right UX.
      if (err instanceof ChickenScratchApiError) {
        return {
          success: false,
          enrolled: false,
          message: err.message,
          ...(err.errorCode ? { errorCode: err.errorCode } : {}),
          ...(Array.isArray(err.details.enrolledClasses)
            ? { enrolledClasses: err.details.enrolledClasses as string[] }
            : {}),
        };
      }
      return { success: false, enrolled: false, message: error.message };
    }
  }

  /**
   * Run the full verification flow for a user.
   * Renders the multi-step UI (1 signature + shapes in challenge order) inside the container.
   * Returns pass/fail result.
   */
  async verify(externalUserId: string): Promise<AuthResult> {
    try {
      const flowStart = Date.now();
      const stepDurations: { step: string; durationMs: number }[] = [];

      // Get challenge (server returns randomized shape order)
      const challenge = await this.api.getChallenge(externalUserId);
      const totalSteps = 1 + challenge.shapeOrder.length; // signature + shapes

      const ui = new UIRenderer(this.container, this.options.theme);
      const canvas = new DrawingCanvas(ui.getCanvasContainer());

      let currentStep = 0;
      let stepStart = Date.now();

      // Signature
      currentStep++;
      ui.setStep('Sign your name', currentStep, totalSteps);
      this.options.onStepChange?.({
        type: 'verify',
        step: 'signature',
        current: currentStep,
        total: totalSteps,
        label: 'Sign your name',
      });

      const signatureData = await this.waitForDrawing(ui, canvas);
      stepDurations.push({ step: 'signature', durationMs: Date.now() - stepStart });

      // Shapes in challenge order
      const shapes: { shapeType: string; signatureData: RawSignatureData }[] = [];

      for (const shapeType of challenge.shapeOrder) {
        currentStep++;
        stepStart = Date.now();
        const label = SHAPE_LABELS[shapeType] || `Draw: ${shapeType}`;
        ui.setStep(label, currentStep, totalSteps);
        this.options.onStepChange?.({
          type: 'verify',
          step: shapeType,
          current: currentStep,
          total: totalSteps,
          label,
        });

        const shapeData = await this.waitForDrawing(ui, canvas);
        shapes.push({ shapeType, signatureData: shapeData });
        stepDurations.push({ step: shapeType, durationMs: Date.now() - stepStart });
      }

      // Submit everything
      ui.showLoading('Verifying...');
      const durationMs = Date.now() - flowStart;

      const response = await this.api.verifyFull({
        externalUserId,
        signatureData,
        shapes,
        challengeId: challenge.challengeId,
        durationMs,
        stepDurations,
      });

      const apiResponse = response as typeof response & {
        attestationToken?: string;
        errorCode?: string;
        enrolledClasses?: string[];
      };
      const result: AuthResult = {
        success: response.success,
        authenticated: response.authenticated,
        message: response.authenticated
          ? 'Identity verified successfully.'
          : 'Verification failed. Please try again.',
        ...(apiResponse.attestationToken ? { attestationToken: apiResponse.attestationToken } : {}),
        ...(apiResponse.errorCode ? { errorCode: apiResponse.errorCode } : {}),
        ...(apiResponse.enrolledClasses ? { enrolledClasses: apiResponse.enrolledClasses } : {}),
      };

      ui.showResult(response.authenticated, result.message);
      this.options.onComplete?.(result);
      canvas.destroy();
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      if (err instanceof ChickenScratchApiError) {
        return {
          success: false,
          authenticated: false,
          message: err.message,
          ...(err.errorCode ? { errorCode: err.errorCode } : {}),
          ...(Array.isArray(err.details.enrolledClasses)
            ? { enrolledClasses: err.details.enrolledClasses as string[] }
            : {}),
        };
      }
      return { success: false, authenticated: false, message: error.message };
    }
  }

  /**
   * Check if a user is enrolled.
   */
  async isEnrolled(externalUserId: string): Promise<boolean> {
    const status = await this.api.getEnrollmentStatus(externalUserId);
    return status.enrolled;
  }

  /**
   * Wait for the user to draw something and click submit.
   * Returns a promise that resolves with the stroke data.
   */
  private waitForDrawing(ui: UIRenderer, canvas: DrawingCanvas): Promise<RawSignatureData> {
    return new Promise((resolve) => {
      canvas.clear();
      ui.showDrawing();
      ui.setSubmitEnabled(false);

      const checkInterval = setInterval(() => {
        ui.setSubmitEnabled(!canvas.isEmpty());
      }, 200);

      ui.setHandlers(
        () => canvas.clear(),
        () => {
          if (canvas.isEmpty()) return;
          clearInterval(checkInterval);
          resolve(canvas.buildSignatureData(this.deviceCaps));
        },
      );
    });
  }
}
