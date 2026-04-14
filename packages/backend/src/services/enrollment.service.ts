import type { RawSignatureData, AllFeatures, MLFeatureVector, EnrollmentResponse, ChallengeItemType } from '@chicken-scratch/shared';
import { THRESHOLDS, ALL_CHALLENGE_TYPES, isDrawingType } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { extractMLFeatures } from '../features/comparison/ml-features.js';
import { extractShapeSpecificFeatures } from '../features/extraction/shape.js';
import { extractStrokes } from '../features/extraction/helpers/stroke-parser.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';
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
  // Timing features
  const timingKeys = Object.keys(featureSets[0].timing) as (keyof AllFeatures['timing'])[];
  for (const key of timingKeys) {
    devs[`timing.${key}`] = stddev(featureSets.map(f => f.timing[key]));
  }
  // Geometric features
  const geoKeys = Object.keys(featureSets[0].geometric) as (keyof AllFeatures['geometric'])[];
  for (const key of geoKeys) {
    devs[`geometric.${key}`] = stddev(featureSets.map(f => f.geometric[key]));
  }
  // Security features
  const secKeys = Object.keys(featureSets[0].security) as (keyof AllFeatures['security'])[];
  for (const key of secKeys) {
    devs[`security.${key}`] = stddev(featureSets.map(f => f.security[key]));
  }
  // Pressure features (if available)
  if (featureSets.every(f => f.pressure !== null)) {
    const pKeys = Object.keys(featureSets[0].pressure!) as (keyof NonNullable<AllFeatures['pressure']>)[];
    for (const key of pKeys) {
      devs[`pressure.${key}`] = stddev(featureSets.map(f => f.pressure![key]));
    }
  }
  return devs;
}

export function enrollSample(
  username: string,
  signatureData: RawSignatureData,
): EnrollmentResponse {
  // Find or create user
  let user = userRepo.findByUsername(username);
  if (!user) {
    user = userRepo.createUser(username);
  }

  if (user.enrolled) {
    return {
      success: false,
      userId: user.id,
      sampleNumber: 0,
      samplesRemaining: 0,
      enrolled: true,
      message: 'User is already enrolled.',
    };
  }

  const currentCount = sigRepo.getSampleCount(user.id);
  if (currentCount >= THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED) {
    return {
      success: false,
      userId: user.id,
      sampleNumber: currentCount,
      samplesRemaining: 0,
      enrolled: false,
      message: 'All samples already collected. Finalizing enrollment.',
    };
  }

  // Extract features
  const features = extractAllFeatures(signatureData);
  const mlFeatures = extractMLFeatures(signatureData);
  const sampleNumber = currentCount + 1;

  // Store sample
  sigRepo.createSample(
    user.id,
    sampleNumber,
    signatureData,
    features,
    mlFeatures,
    signatureData.deviceCapabilities,
  );

  const samplesRemaining = THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED - sampleNumber;

  // If all samples collected, compute and store baseline
  if (sampleNumber === THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED) {
    const samples = sigRepo.getSamples(user.id);
    const allFeatureSets = samples.map(s => JSON.parse(s.features) as AllFeatures);
    const allMLSets = samples.map(s => JSON.parse(s.ml_features) as MLFeatureVector);

    const avgFeatures = averageFeatures(allFeatureSets);
    const avgML = averageMLFeatures(allMLSets);
    const featureStdDevs = computeStdDevs(allFeatureSets);

    sigRepo.upsertBaseline(
      user.id,
      avgFeatures,
      avgML,
      featureStdDevs,
      avgFeatures.metadata.hasPressureData,
    );

    userRepo.markEnrolled(user.id);

    return {
      success: true,
      userId: user.id,
      sampleNumber,
      samplesRemaining: 0,
      enrolled: true,
      message: 'Enrollment complete! Baseline computed from all samples.',
    };
  }

  return {
    success: true,
    userId: user.id,
    sampleNumber,
    samplesRemaining,
    enrolled: false,
    message: `Sample ${sampleNumber} of ${THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED} recorded.`,
  };
}

export function enrollShape(
  username: string,
  shapeType: ChallengeItemType,
  signatureData: RawSignatureData,
): { success: boolean; message: string } {
  const user = userRepo.findByUsername(username);
  if (!user) {
    return { success: false, message: 'User not found. Please enroll your signature first.' };
  }

  // Signature enrollment must be complete before shapes/drawings
  const sigCount = sigRepo.getSampleCount(user.id);
  if (sigCount < THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED) {
    return { success: false, message: 'Please complete signature enrollment first.' };
  }

  // Extract biometric + shape-specific features
  const strokes = extractStrokes(signatureData);
  const biometricFeatures = extractAllFeatures(signatureData);
  const shapeFeatures = extractShapeSpecificFeatures(strokes, shapeType);

  // Store sample (1 per type, upserts on conflict)
  shapeRepo.createShapeSample(
    user.id,
    shapeType,
    signatureData,
    biometricFeatures,
    shapeFeatures,
    signatureData.deviceCapabilities,
  );

  // With 1 sample, baseline = the sample itself
  shapeRepo.upsertShapeBaseline(user.id, shapeType, biometricFeatures, shapeFeatures);

  // Check if all shapes AND drawings are enrolled
  const enrolledSamples = shapeRepo.getShapeSamples(user.id);
  const enrolledTypes = new Set(enrolledSamples.map(s => s.shape_type));
  const allDone = ALL_CHALLENGE_TYPES.every(t => enrolledTypes.has(t));

  if (allDone) {
    userRepo.markEnrolled(user.id);
  }

  const typeLabel = isDrawingType(shapeType) ? 'Drawing' : 'Shape';
  return {
    success: true,
    message: `${typeLabel} '${shapeType}' enrolled successfully.${allDone ? ' All complete!' : ''}`,
  };
}

export function getEnrollmentStatus(username: string) {
  const user = userRepo.findByUsername(username);
  if (!user) {
    return {
      username,
      enrolled: false,
      samplesCollected: 0,
      samplesRequired: THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED,
      shapesEnrolled: [] as string[],
      shapesRequired: ALL_CHALLENGE_TYPES as string[],
    };
  }

  const shapeSamples = shapeRepo.getShapeSamples(user.id);
  const shapesEnrolled = shapeSamples.map(s => s.shape_type);

  return {
    username,
    enrolled: !!user.enrolled,
    samplesCollected: sigRepo.getSampleCount(user.id),
    samplesRequired: THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED,
    shapesEnrolled,
    shapesRequired: ALL_CHALLENGE_TYPES as string[],
  };
}
