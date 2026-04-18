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
    pressureRange: avgField(f => f.pressure!.pressureRange),
    contactTimeRatio: avgField(f => f.pressure!.contactTimeRatio),
    pressureBuildupRate: avgField(f => f.pressure!.pressureBuildupRate),
    pressureReleaseRate: avgField(f => f.pressure!.pressureReleaseRate),
  } : null;

  return {
    pressure,
    timing: {
      pauseDetection: avgField(f => f.timing.pauseDetection),
      rhythmConsistency: avgField(f => f.timing.rhythmConsistency),
      tempoVariation: avgField(f => f.timing.tempoVariation),
      dwellTimePatterns: avgField(f => f.timing.dwellTimePatterns),
      interStrokeTiming: avgField(f => f.timing.interStrokeTiming),
      drawingDurationTotal: avgField(f => f.timing.drawingDurationTotal),
      pauseTimeRatio: avgField(f => f.timing.pauseTimeRatio),
      avgStrokeDuration: avgField(f => f.timing.avgStrokeDuration),
    },
    geometric: {
      strokeComplexity: avgField(f => f.geometric.strokeComplexity),
      tremorIndex: avgField(f => f.geometric.tremorIndex),
      smoothnessIndex: avgField(f => f.geometric.smoothnessIndex),
      directionChanges: avgField(f => f.geometric.directionChanges),
      curvatureAnalysis: avgField(f => f.geometric.curvatureAnalysis),
      spatialEfficiency: avgField(f => f.geometric.spatialEfficiency),
      strokeOverlapRatio: avgField(f => f.geometric.strokeOverlapRatio),
    },
    security: {
      speedAnomalyScore: avgField(f => f.security.speedAnomalyScore),
      timingRegularityScore: avgField(f => f.security.timingRegularityScore),
      behavioralAuthenticityScore: avgField(f => f.security.behavioralAuthenticityScore),
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
 */
function computeStdDevs(featureSets: AllFeatures[]): Record<string, number> {
  const devs: Record<string, number> = {};
  const timingKeys = Object.keys(featureSets[0].timing) as (keyof AllFeatures['timing'])[];
  for (const key of timingKeys) {
    devs[`timing.${key}`] = stddev(featureSets.map(f => f.timing[key]));
  }
  const geoKeys = Object.keys(featureSets[0].geometric) as (keyof AllFeatures['geometric'])[];
  for (const key of geoKeys) {
    devs[`geometric.${key}`] = stddev(featureSets.map(f => f.geometric[key]));
  }
  const secKeys = Object.keys(featureSets[0].security) as (keyof AllFeatures['security'])[];
  for (const key of secKeys) {
    devs[`security.${key}`] = stddev(featureSets.map(f => f.security[key]));
  }
  if (featureSets.every(f => f.pressure !== null)) {
    const pKeys = Object.keys(featureSets[0].pressure!) as (keyof NonNullable<AllFeatures['pressure']>)[];
    for (const key of pKeys) {
      devs[`pressure.${key}`] = stddev(featureSets.map(f => f.pressure![key]));
    }
  }
  return devs;
}

/**
 * Default standard deviations for single-sample demo baselines.
 * Without these, a 1-sample baseline would have stddev=0 for everything,
 * making verification impossibly strict. These values represent reasonable
 * variance from typical enrollment data.
 */
function getDefaultStdDevs(): Record<string, number> {
  return {
    'timing.pauseDetection': 0.15,
    'timing.rhythmConsistency': 0.1,
    'timing.tempoVariation': 0.12,
    'timing.dwellTimePatterns': 0.1,
    'timing.interStrokeTiming': 0.15,
    'timing.drawingDurationTotal': 0.2,
    'timing.pauseTimeRatio': 0.1,
    'timing.avgStrokeDuration': 0.15,
    'geometric.strokeComplexity': 0.1,
    'geometric.tremorIndex': 0.08,
    'geometric.smoothnessIndex': 0.1,
    'geometric.directionChanges': 0.12,
    'geometric.curvatureAnalysis': 0.1,
    'geometric.spatialEfficiency': 0.08,
    'geometric.aspectRatio': 0.1,
    'geometric.centerOfMassX': 0.15,
    'geometric.centerOfMassY': 0.15,
    'security.speedAnomalyScore': 0.1,
    'security.pressureAnomalyScore': 0.1,
    'security.directionConsistency': 0.1,
    'security.velocitySmoothing': 0.12,
    'pressure.avgPressure': 0.1,
    'pressure.maxPressure': 0.1,
    'pressure.minPressure': 0.08,
    'pressure.pressureStd': 0.08,
    'pressure.pressureRange': 0.1,
    'pressure.contactTimeRatio': 0.08,
    'pressure.pressureBuildupRate': 0.1,
    'pressure.pressureReleaseRate': 0.1,
  };
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
    // For demo (single sample), use default stddevs to avoid zero-tolerance scoring
    const featureStdDevs = isDemo && samples.length === 1
      ? getDefaultStdDevs()
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

  await shapeRepo.upsertShapeBaseline(user.id, shapeType, biometricFeatures, shapeFeatures, deviceClass);

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
