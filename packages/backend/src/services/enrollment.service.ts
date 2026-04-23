import type { RawSignatureData, AllFeatures, MLFeatureVector, EnrollmentResponse, ChallengeItemType, DeviceClass } from '@chicken-scratch/shared';
import { THRESHOLDS, DEMO_CHALLENGE_TYPES, ALL_CHALLENGE_TYPES, isDrawingType, ADD_DEVICE_RECENT_VERIFY_WINDOW_MS } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { extractMLFeatures } from '../features/comparison/ml-features.js';
import { extractShapeSpecificFeatures } from '../features/extraction/shape.js';
import { extractStrokes } from '../features/extraction/helpers/stroke-parser.js';
import { detectDeviceClass } from '../features/device-class.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';
import * as authAttemptRepo from '../db/repositories/auth-attempt.repo.js';
import { mean, stddev } from '../features/extraction/helpers/math.js';

/**
 * Average numeric fields across multiple feature objects.
 *
 * Feature layout is v3 (see packages/shared/src/types/features.ts):
 *   pressure (7) | timing (9) | kinematic (6) | geometric (17) | diagnosticFlags (3)
 * The first four buckets feed the matcher; diagnosticFlags is an anomaly signal.
 */
function averageFeatures(featureSets: AllFeatures[]): AllFeatures {
  const hasPressure = featureSets.every(f => f.pressure !== null);

  const avgField = (getter: (f: AllFeatures) => number): number =>
    mean(featureSets.map(getter));

  const pressure = hasPressure ? {
    avgPressure: avgField(f => f.pressure!.avgPressure),
    maxPressure: avgField(f => f.pressure!.maxPressure),
    minPressure: avgField(f => f.pressure!.minPressure),
    pressureStd: avgField(f => f.pressure!.pressureStd),
    contactTimeRatio: avgField(f => f.pressure!.contactTimeRatio),
    pressureBuildupRate: avgField(f => f.pressure!.pressureBuildupRate),
    pressureReleaseRate: avgField(f => f.pressure!.pressureReleaseRate),
  } : null;

  return {
    pressure,
    timing: {
      rhythmConsistency: avgField(f => f.timing.rhythmConsistency),
      tempoVariation: avgField(f => f.timing.tempoVariation),
      dwellTimePatterns: avgField(f => f.timing.dwellTimePatterns),
      interStrokeTiming: avgField(f => f.timing.interStrokeTiming),
      drawingDurationTotal: avgField(f => f.timing.drawingDurationTotal),
      pauseTimeRatio: avgField(f => f.timing.pauseTimeRatio),
      avgStrokeDuration: avgField(f => f.timing.avgStrokeDuration),
      penUpDurationMean: avgField(f => f.timing.penUpDurationMean),
      penUpDurationStd: avgField(f => f.timing.penUpDurationStd),
    },
    kinematic: {
      velocityAvg: avgField(f => f.kinematic.velocityAvg),
      velocityMax: avgField(f => f.kinematic.velocityMax),
      velocityStd: avgField(f => f.kinematic.velocityStd),
      velocityAtPenDown: avgField(f => f.kinematic.velocityAtPenDown),
      accelerationAvg: avgField(f => f.kinematic.accelerationAvg),
      accelerationMax: avgField(f => f.kinematic.accelerationMax),
    },
    geometric: {
      strokeComplexity: avgField(f => f.geometric.strokeComplexity),
      tremorIndex: avgField(f => f.geometric.tremorIndex),
      smoothnessIndex: avgField(f => f.geometric.smoothnessIndex),
      directionChanges: avgField(f => f.geometric.directionChanges),
      curvatureAnalysis: avgField(f => f.geometric.curvatureAnalysis),
      strokeOverlapRatio: avgField(f => f.geometric.strokeOverlapRatio),
      bboxWidth: avgField(f => f.geometric.bboxWidth),
      bboxHeight: avgField(f => f.geometric.bboxHeight),
      aspectRatio: avgField(f => f.geometric.aspectRatio),
      centroidX: avgField(f => f.geometric.centroidX),
      centroidY: avgField(f => f.geometric.centroidY),
      strokeCount: avgField(f => f.geometric.strokeCount),
      penDownCount: avgField(f => f.geometric.penDownCount),
      penUpCount: avgField(f => f.geometric.penUpCount),
      criticalPointCount: avgField(f => f.geometric.criticalPointCount),
      directionHist0: avgField(f => f.geometric.directionHist0),
      directionHist1: avgField(f => f.geometric.directionHist1),
      directionHist2: avgField(f => f.geometric.directionHist2),
      directionHist3: avgField(f => f.geometric.directionHist3),
      directionHist4: avgField(f => f.geometric.directionHist4),
      directionHist5: avgField(f => f.geometric.directionHist5),
      directionHist6: avgField(f => f.geometric.directionHist6),
      directionHist7: avgField(f => f.geometric.directionHist7),
    },
    diagnosticFlags: {
      speedAnomalyScore: avgField(f => f.diagnosticFlags.speedAnomalyScore),
      timingRegularityScore: avgField(f => f.diagnosticFlags.timingRegularityScore),
      behavioralAuthenticityScore: avgField(f => f.diagnosticFlags.behavioralAuthenticityScore),
    },
    metadata: {
      hasPressureData: hasPressure,
      extractionTimeMs: 0,
      featureVersion: THRESHOLDS.FEATURE_VERSION,
    },
  };
}

function averageMLFeatures(mlSets: MLFeatureVector[]): MLFeatureVector {
  const avg = (getter: (f: MLFeatureVector) => number) => mean(mlSets.map(getter));
  return {
    strokeCount: avg(f => f.strokeCount),
    totalPoints: avg(f => f.totalPoints),
    totalDurationMs: avg(f => f.totalDurationMs),
    avgPointsPerStroke: avg(f => f.avgPointsPerStroke),
    avgVelocity: avg(f => f.avgVelocity),
    maxVelocity: avg(f => f.maxVelocity),
    minVelocity: avg(f => f.minVelocity),
    velocityStd: avg(f => f.velocityStd),
    width: avg(f => f.width),
    height: avg(f => f.height),
    area: avg(f => f.area),
    aspectRatio: avg(f => f.aspectRatio),
    centerX: avg(f => f.centerX),
    centerY: avg(f => f.centerY),
    avgStrokeLength: avg(f => f.avgStrokeLength),
    totalLength: avg(f => f.totalLength),
    lengthVariation: avg(f => f.lengthVariation),
    avgStrokeDuration: avg(f => f.avgStrokeDuration),
    durationVariation: avg(f => f.durationVariation),
  };
}

/**
 * Compute per-feature standard deviations across enrollment samples.
 * Iterates whatever keys are actually on the extracted features — that way
 * adding a new feature in the extractor automatically shows up here without
 * a secondary edit (v3 lesson: the old hand-enumerated default-stddev map
 * drifted out of sync with the real interfaces).
 *
 * All computed stddevs are scaled by THRESHOLDS.REAL_STDDEV_SCALE to close
 * the enrollment-vs-test-time variance gap (users are more consistent in
 * their 3-in-a-row enrollment than in real verify sessions). Without this
 * scaling the matcher gates on too-tight tolerance, producing thin genuine
 * margins — observed as 3 genuine iPhone-touch verifies clustering at
 * mean 80.90 / σ 0.44 against threshold 80. See thresholds.ts comment.
 */
function computeStdDevs(featureSets: AllFeatures[]): Record<string, number> {
  const scale = THRESHOLDS.REAL_STDDEV_SCALE;
  const devs: Record<string, number> = {};
  const bucketsToAverage: Array<keyof Pick<AllFeatures, 'timing' | 'kinematic' | 'geometric'>> =
    ['timing', 'kinematic', 'geometric'];

  for (const bucket of bucketsToAverage) {
    const keys = Object.keys(featureSets[0][bucket]);
    for (const key of keys) {
      devs[`${bucket}.${key}`] = scale * stddev(
        featureSets.map(f => (f[bucket] as unknown as Record<string, number>)[key]),
      );
    }
  }

  if (featureSets.every(f => f.pressure !== null)) {
    const pKeys = Object.keys(featureSets[0].pressure!) as (keyof NonNullable<AllFeatures['pressure']>)[];
    for (const key of pKeys) {
      devs[`pressure.${String(key)}`] = scale * stddev(featureSets.map(f => f.pressure![key]));
    }
  }
  return devs;
}

/**
 * Default per-feature standard deviations derived from a baseline's own
 * magnitudes. Used in two situations:
 *   1. Demo single-sample enrollment — variance across 1 sample is 0 for
 *      every field, which would make verification impossibly strict under
 *      Mahalanobis scaling.
 *   2. Shape baselines — each shape type stores only one sample per user
 *      (ON CONFLICT DO UPDATE in upsert), so we can't compute real variance.
 *
 * Strategy: per-bucket coefficient-of-variation priors × |baseline value|.
 * A feature with baseline 2000ms and a timing CV of 0.15 gets a 300ms stddev.
 * A feature with baseline 0.3 and a timing CV of 0.15 gets a 0.045 stddev.
 * This keeps tolerance proportional to feature magnitude, which is what we
 * want — the old "fixed 0.12 absolute stddev for everything" approach was
 * nonsense across the wildly different magnitudes in the feature set.
 */
function getDefaultStdDevs(baseline: AllFeatures): Record<string, number> {
  // Coefficient-of-variation priors per bucket. Substantially looser than
  // the initial guess — the first prod run showed kinematic features
  // scoring ~10/100 on a same-session genuine verify, because real online-
  // signature velocity CV is 30-50% (Plamondon-Djioua lognormal theory,
  // Martinez-Diaz et al.) and I'd set the kinematic prior at 0.18. Timing
  // and geometric features also have higher real-world CV than I first
  // budgeted. These values still need empirical recalibration post-deploy,
  // but should at minimum allow a same-user demo verify to pass.
  const CV_PRIOR = {
    timing: 0.30,
    kinematic: 0.50,
    geometric: 0.25,
    pressure: 0.20,
  } as const;

  const devs: Record<string, number> = {};

  const applyBucket = <T extends Record<string, number>>(
    bucket: string,
    obj: T,
    cv: number,
  ): void => {
    for (const [key, val] of Object.entries(obj)) {
      devs[`${bucket}.${key}`] = cv * Math.abs(val);
    }
  };

  applyBucket('timing', baseline.timing as unknown as Record<string, number>, CV_PRIOR.timing);
  applyBucket('kinematic', baseline.kinematic as unknown as Record<string, number>, CV_PRIOR.kinematic);
  applyBucket('geometric', baseline.geometric as unknown as Record<string, number>, CV_PRIOR.geometric);
  if (baseline.pressure !== null) {
    applyBucket('pressure', baseline.pressure as unknown as Record<string, number>, CV_PRIOR.pressure);
  }

  return devs;
}

/**
 * Validate that a signature sample meets minimum quality requirements.
 * Returns an error message string if rejected, or null if OK.
 */
function validateSignatureQuality(signatureData: RawSignatureData): string | null {
  const { strokes } = signatureData;

  // Total point count across all strokes
  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);
  if (totalPoints < THRESHOLDS.QUALITY_MIN_POINTS) {
    return `Sample quality too low: only ${totalPoints} data points recorded (minimum ${THRESHOLDS.QUALITY_MIN_POINTS}). Please draw more slowly or use a larger gesture.`;
  }

  // Duration check — use stroke startTime/endTime
  const firstStart = strokes[0].startTime;
  const lastEnd = strokes[strokes.length - 1].endTime;
  const duration = lastEnd - firstStart;
  if (duration < THRESHOLDS.QUALITY_MIN_DURATION_MS) {
    return `Sample too fast: drawing completed in ${duration}ms (minimum ${THRESHOLDS.QUALITY_MIN_DURATION_MS}ms). Please draw naturally.`;
  }

  // Bounding box check
  const allPoints = strokes.flatMap(s => s.points);
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  const bboxWidth = Math.max(...xs) - Math.min(...xs);
  const bboxHeight = Math.max(...ys) - Math.min(...ys);
  if (bboxWidth < THRESHOLDS.QUALITY_MIN_BBOX_PX && bboxHeight < THRESHOLDS.QUALITY_MIN_BBOX_PX) {
    return `Sample too small: bounding box is ${Math.round(bboxWidth)}×${Math.round(bboxHeight)}px (minimum ${THRESHOLDS.QUALITY_MIN_BBOX_PX}px in at least one dimension). Please use more of the canvas.`;
  }

  return null;
}

export interface EnrollOptions {
  /**
   * Customer-controlled opt-out of the recent-verify gate. Intended for
   * flows where the customer's backend has already authenticated the user
   * with high assurance (password + 2FA + device trust, etc.) and wants
   * to skip our biometric-proof gate. Default false — caller must
   * deliberately opt out.
   */
  skipRecentVerify?: boolean;
}

export async function enrollSample(
  username: string,
  signatureData: RawSignatureData,
  isDemo: boolean = false,
  options: EnrollOptions = {},
): Promise<EnrollmentResponse & { errorCode?: string; deviceClass?: DeviceClass; enrolledClasses?: DeviceClass[] }> {
  const deviceClass = detectDeviceClass(signatureData);

  // Find or create user
  let user = await userRepo.findByUsername(username);
  if (!user) {
    user = await userRepo.createUser(username);
  }

  // Check what the user has already enrolled.
  const enrolledClasses = await sigRepo.getEnrolledClasses(user.id);
  const alreadyEnrolledThisClass = enrolledClasses.includes(deviceClass);
  const hasOtherClass = enrolledClasses.length > 0 && !alreadyEnrolledThisClass;

  if (alreadyEnrolledThisClass) {
    // Same-class re-enrollment is not supported via this endpoint. A dedicated
    // "refresh baseline" flow would delete the existing baseline first.
    return {
      success: false,
      userId: user.id,
      sampleNumber: 0,
      samplesRemaining: 0,
      enrolled: true,
      message: `Already enrolled on ${deviceClass}.`,
      errorCode: 'ALREADY_ENROLLED',
      deviceClass,
      enrolledClasses,
    };
  }

  // Adding a new class (user has other-class baselines): require a recent
  // successful verify, unless the caller explicitly opts out. This is the
  // primary safety gate — an attacker can't silently add their own device
  // without biometric proof they're the legitimate user.
  if (hasOtherClass && !options.skipRecentVerify) {
    const recentOk = await authAttemptRepo.hasRecentSuccessfulVerify(
      user.id,
      ADD_DEVICE_RECENT_VERIFY_WINDOW_MS,
    );
    if (!recentOk) {
      return {
        success: false,
        userId: user.id,
        sampleNumber: 0,
        samplesRemaining: 0,
        enrolled: true,
        message: `Adding a new device class requires a recent successful verification on an already-enrolled device.`,
        errorCode: 'RECENT_VERIFY_REQUIRED',
        deviceClass,
        enrolledClasses,
      };
    }
  }

  const samplesRequired = isDemo ? THRESHOLDS.DEMO_ENROLLMENT_SAMPLES : THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED;

  const currentCount = await sigRepo.getSampleCount(user.id, deviceClass);
  if (currentCount >= samplesRequired) {
    return {
      success: false,
      userId: user.id,
      sampleNumber: currentCount,
      samplesRemaining: 0,
      enrolled: false,
      message: 'All samples already collected. Finalizing enrollment.',
      deviceClass,
    };
  }

  // Quality gate — reject low-quality samples before storing
  const qualityError = validateSignatureQuality(signatureData);
  if (qualityError) {
    return {
      success: false,
      userId: user.id,
      sampleNumber: currentCount,
      samplesRemaining: samplesRequired - currentCount,
      enrolled: false,
      message: qualityError,
      deviceClass,
    };
  }

  // Extract features
  const features = extractAllFeatures(signatureData);
  const mlFeatures = extractMLFeatures(signatureData);
  const sampleNumber = currentCount + 1;

  // Store sample
  await sigRepo.createSample(
    user.id,
    sampleNumber,
    signatureData,
    features,
    mlFeatures,
    signatureData.deviceCapabilities,
    deviceClass,
  );

  const samplesRemaining = samplesRequired - sampleNumber;

  // If all samples collected, compute and store baseline
  if (sampleNumber === samplesRequired) {
    const samples = await sigRepo.getSamples(user.id, deviceClass);
    const allFeatureSets = samples.map(s => JSON.parse(s.features) as AllFeatures);
    const allMLSets = samples.map(s => JSON.parse(s.ml_features) as MLFeatureVector);

    const avgFeatures = averageFeatures(allFeatureSets);
    const avgML = averageMLFeatures(allMLSets);
    // For demo (single sample), derive stddevs from the baseline's own
    // magnitudes via CV priors — variance across 1 sample is 0, which would
    // make Mahalanobis scoring infinitely strict.
    const featureStdDevs = isDemo && samples.length === 1
      ? getDefaultStdDevs(avgFeatures)
      : computeStdDevs(allFeatureSets);

    await sigRepo.upsertBaseline(
      user.id,
      avgFeatures,
      avgML,
      featureStdDevs,
      avgFeatures.metadata.hasPressureData,
      deviceClass,
    );

    await userRepo.markEnrolled(user.id);

    return {
      success: true,
      userId: user.id,
      sampleNumber,
      samplesRemaining: 0,
      enrolled: true,
      message: `Enrollment complete on ${deviceClass}! Baseline computed from all samples.`,
      deviceClass,
      enrolledClasses: [...enrolledClasses, deviceClass],
    };
  }

  return {
    success: true,
    userId: user.id,
    sampleNumber,
    samplesRemaining,
    enrolled: false,
    message: `Sample ${sampleNumber} of ${samplesRequired} recorded.`,
    deviceClass,
  };
}

export async function enrollShape(
  username: string,
  shapeType: ChallengeItemType,
  signatureData: RawSignatureData,
  isDemo: boolean = false,
): Promise<{ success: boolean; message: string; deviceClass?: DeviceClass }> {
  const deviceClass = detectDeviceClass(signatureData);

  const user = await userRepo.findByUsername(username);
  if (!user) {
    return { success: false, message: 'User not found. Please enroll your signature first.' };
  }

  // Signature enrollment for this class must be complete first. Shape enrollment
  // piggybacks on the same class boundary — you enroll shapes on the class you
  // already enrolled a signature on.
  const samplesRequired = isDemo ? THRESHOLDS.DEMO_ENROLLMENT_SAMPLES : THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED;
  const sigCount = await sigRepo.getSampleCount(user.id, deviceClass);
  if (sigCount < samplesRequired) {
    return {
      success: false,
      message: `Please complete signature enrollment on ${deviceClass} first.`,
      deviceClass,
    };
  }

  // Quality gate for shapes too
  const qualityError = validateSignatureQuality(signatureData);
  if (qualityError) {
    return { success: false, message: qualityError, deviceClass };
  }

  const strokes = extractStrokes(signatureData);
  const biometricFeatures = extractAllFeatures(signatureData);
  const shapeFeatures = extractShapeSpecificFeatures(strokes, shapeType);

  await shapeRepo.createShapeSample(
    user.id,
    shapeType,
    signatureData,
    biometricFeatures,
    shapeFeatures,
    signatureData.deviceCapabilities,
    deviceClass,
  );

  // Shapes enroll one sample per type (see shape_samples ON CONFLICT DO UPDATE),
  // so we can't compute real cross-sample variance. Derive stddevs from the
  // baseline's own magnitudes via CV priors — matches the demo path for
  // signatures. If you later collect multiple shape samples per user, swap
  // this for the real computeStdDevs([...]) over the sample list.
  const biometricStdDevs = getDefaultStdDevs(biometricFeatures);
  await shapeRepo.upsertShapeBaseline(
    user.id,
    shapeType,
    biometricFeatures,
    shapeFeatures,
    biometricStdDevs,
    deviceClass,
  );

  const enrolledSamples = await shapeRepo.getShapeSamples(user.id, deviceClass);
  const enrolledTypes = new Set(enrolledSamples.map(s => s.shape_type));
  const allDone = ALL_CHALLENGE_TYPES.every(t => enrolledTypes.has(t));

  if (allDone) {
    await userRepo.markEnrolled(user.id);
  }

  const typeLabel = isDrawingType(shapeType) ? 'Drawing' : 'Shape';
  return {
    success: true,
    message: `${typeLabel} '${shapeType}' enrolled successfully.${allDone ? ' All complete!' : ''}`,
    deviceClass,
  };
}

export async function getEnrollmentStatus(
  username: string,
  isDemo: boolean = false,
  deviceClass?: DeviceClass,
) {
  const samplesRequired = isDemo ? THRESHOLDS.DEMO_ENROLLMENT_SAMPLES : THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED;
  const shapesRequired = isDemo ? [...DEMO_CHALLENGE_TYPES] as string[] : ALL_CHALLENGE_TYPES as string[];

  const user = await userRepo.findByUsername(username);
  if (!user) {
    return {
      username,
      enrolled: false,
      samplesCollected: 0,
      samplesRequired,
      shapesEnrolled: [] as string[],
      shapesRequired,
      enrolledClasses: [] as DeviceClass[],
    };
  }

  const enrolledClasses = await sigRepo.getEnrolledClasses(user.id);

  // If the caller wants status for a specific class, scope the per-class counts.
  // Otherwise aggregate across classes (back-compat for callers that just want
  // "is this user set up").
  const [sampleCount, shapeSamples] = await Promise.all([
    deviceClass
      ? sigRepo.getSampleCount(user.id, deviceClass)
      : Promise.resolve(
          (await Promise.all(enrolledClasses.map(c => sigRepo.getSampleCount(user.id, c))))
            .reduce((a, b) => a + b, 0),
        ),
    shapeRepo.getShapeSamples(user.id, deviceClass),
  ]);

  return {
    username,
    enrolled: !!user.enrolled,
    samplesCollected: sampleCount,
    samplesRequired,
    shapesEnrolled: shapeSamples.map(s => s.shape_type),
    shapesRequired,
    enrolledClasses,
  };
}
