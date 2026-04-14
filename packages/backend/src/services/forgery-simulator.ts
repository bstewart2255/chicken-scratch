import type {
  RawSignatureData,
  Stroke,
  StrokePoint,
  ChallengeItemType,
  AllFeatures,
  ShapeSpecificFeatures,
  ShapeScoreBreakdown,
} from '@chicken-scratch/shared';
import type {
  ForgeryLevel,
  ForgeryTrialResult,
  ForgeryLevelResult,
  ForgerySimulationResult,
} from '@chicken-scratch/shared';
import { THRESHOLDS, ALL_CHALLENGE_TYPES } from '@chicken-scratch/shared';
import { extractAllFeatures } from '../features/extraction/index.js';
import { extractShapeSpecificFeatures } from '../features/extraction/shape.js';
import { extractStrokes } from '../features/extraction/helpers/stroke-parser.js';
import { compareFeatures } from '../features/comparison/biometric-score.js';
import { computeShapeScore } from '../features/comparison/shape-score.js';
import { computeCombinedScore } from '../features/comparison/combined-score.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';
import * as authAttemptRepo from '../db/repositories/auth-attempt.repo.js';

// ─── Perturbation helpers ───────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function gaussianNoise(stddev: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─── Stroke perturbation by forgery level ───────────────────────────────────

function perturbPoint(
  p: StrokePoint,
  level: ForgeryLevel,
  canvasWidth: number,
  canvasHeight: number,
): StrokePoint {
  const size = Math.max(canvasWidth, canvasHeight);

  switch (level) {
    case 'replay':
      // Exact copy — no perturbation
      return { ...p };

    case 'skilled': {
      // Subtle perturbation: 3-5% position drift, 5-10% timing jitter
      const posNoise = size * rand(0.03, 0.05);
      return {
        x: p.x + gaussianNoise(posNoise),
        y: p.y + gaussianNoise(posNoise),
        pressure: p.pressure > 0 ? clamp(p.pressure + gaussianNoise(0.05), 0, 1) : 0,
        timestamp: p.timestamp + Math.round(gaussianNoise(p.timestamp * 0.05)),
      };
    }

    case 'unskilled': {
      // Heavy perturbation: 15-25% position shift, 2-3x timing scale, randomized rhythm
      const posNoise = size * rand(0.15, 0.25);
      const timeScale = rand(0.4, 2.5);
      return {
        x: p.x + gaussianNoise(posNoise),
        y: p.y + gaussianNoise(posNoise),
        pressure: p.pressure > 0 ? clamp(Math.random() * 0.8, 0, 1) : 0,
        timestamp: Math.round(p.timestamp * timeScale + gaussianNoise(100)),
      };
    }

    case 'random':
      // Completely random point within canvas bounds
      return {
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        pressure: 0,
        timestamp: p.timestamp + Math.round(Math.random() * 500),
      };
  }
}

function perturbStroke(
  stroke: Stroke,
  level: ForgeryLevel,
  canvasWidth: number,
  canvasHeight: number,
): Stroke {
  if (level === 'random') {
    // Generate random stroke with similar point count but random positions
    const pointCount = Math.max(3, Math.round(stroke.points.length * rand(0.5, 1.5)));
    const baseTime = Date.now();
    const points: StrokePoint[] = [];
    for (let i = 0; i < pointCount; i++) {
      points.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        pressure: 0,
        timestamp: baseTime + i * Math.round(rand(5, 30)),
      });
    }
    return {
      points,
      startTime: points[0].timestamp,
      endTime: points[points.length - 1].timestamp,
    };
  }

  const points = stroke.points.map(p => perturbPoint(p, level, canvasWidth, canvasHeight));

  // For unskilled: occasionally reverse stroke direction
  if (level === 'unskilled' && Math.random() < 0.3) {
    points.reverse();
    // Fix timestamps to be monotonically increasing
    const baseTime = points[0].timestamp;
    const totalDuration = Math.abs(points[points.length - 1].timestamp - baseTime) || 500;
    for (let i = 0; i < points.length; i++) {
      points[i].timestamp = baseTime + Math.round((i / points.length) * totalDuration);
    }
  }

  return {
    points,
    startTime: points[0].timestamp,
    endTime: points[points.length - 1].timestamp,
  };
}

function perturbSignatureData(
  original: RawSignatureData,
  level: ForgeryLevel,
): RawSignatureData {
  const { width, height } = original.canvasSize;

  let strokes: Stroke[];

  if (level === 'random') {
    // Generate random number of strokes (1-5) with random geometry
    const strokeCount = Math.floor(rand(1, 6));
    strokes = [];
    for (let i = 0; i < strokeCount; i++) {
      const pointCount = Math.floor(rand(10, 80));
      const baseTime = Date.now() + i * 500;
      const points: StrokePoint[] = [];
      for (let j = 0; j < pointCount; j++) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          pressure: 0,
          timestamp: baseTime + j * Math.round(rand(5, 30)),
        });
      }
      strokes.push({
        points,
        startTime: points[0].timestamp,
        endTime: points[points.length - 1].timestamp,
      });
    }
  } else if (level === 'unskilled') {
    // Shuffle stroke order and heavily perturb
    strokes = [...original.strokes]
      .sort(() => Math.random() - 0.5)
      .map(s => perturbStroke(s, level, width, height));
  } else {
    strokes = original.strokes.map(s => perturbStroke(s, level, width, height));
  }

  return {
    strokes,
    canvasSize: original.canvasSize,
    deviceCapabilities: original.deviceCapabilities,
    capturedAt: new Date().toISOString(),
  };
}

// ─── Scoring a forged attempt ───────────────────────────────────────────────

interface EnrolledData {
  sigBaseline: AllFeatures;
  sigSampleData: RawSignatureData;
  shapeData: {
    type: ChallengeItemType;
    baseline: { biometric: AllFeatures; shape: ShapeSpecificFeatures };
    sampleData: RawSignatureData;
  }[];
}

function scoreForgedAttempt(
  enrolled: EnrolledData,
  level: ForgeryLevel,
): ForgeryTrialResult {
  // Forge signature
  const forgedSig = perturbSignatureData(enrolled.sigSampleData, level);
  const forgedSigFeatures = extractAllFeatures(forgedSig);
  const sigComparison = compareFeatures(enrolled.sigBaseline, forgedSigFeatures);
  const signatureScore = sigComparison.score;

  // Forge each shape
  const shapeScores: ShapeScoreBreakdown[] = [];
  const perShapeScores: { shapeType: ChallengeItemType; combinedScore: number }[] = [];

  for (const shape of enrolled.shapeData) {
    const forgedShapeData = perturbSignatureData(shape.sampleData, level);
    const forgedStrokes = extractStrokes(forgedShapeData);
    const forgedBiometric = extractAllFeatures(forgedShapeData);
    const forgedShapeFeatures = extractShapeSpecificFeatures(forgedStrokes, shape.type);

    const { biometricScore, shapeScore, combinedScore } = computeShapeScore(
      shape.baseline.biometric,
      forgedBiometric,
      shape.baseline.shape,
      forgedShapeFeatures,
    );

    shapeScores.push({
      shapeType: shape.type,
      biometricScore: Math.round(biometricScore * 100) / 100,
      shapeScore: Math.round(shapeScore * 100) / 100,
      combinedScore: Math.round(combinedScore * 100) / 100,
    });

    perShapeScores.push({
      shapeType: shape.type,
      combinedScore: Math.round(combinedScore * 100) / 100,
    });
  }

  const threshold = THRESHOLDS.AUTH_SCORE_DEFAULT;
  const { finalScore, authenticated } = computeCombinedScore(signatureScore, shapeScores, threshold);

  const avgShapeScore = shapeScores.length > 0
    ? shapeScores.reduce((sum, s) => sum + s.combinedScore, 0) / shapeScores.length
    : 0;

  return {
    score: finalScore,
    authenticated,
    signatureScore: Math.round(signatureScore * 100) / 100,
    avgShapeScore: Math.round(avgShapeScore * 100) / 100,
    shapeScores: perShapeScores,
  };
}

// ─── Main simulation runner ─────────────────────────────────────────────────

const LEVEL_METADATA: Record<ForgeryLevel, { label: string; description: string }> = {
  random: {
    label: 'Random (Zero Knowledge)',
    description: 'Completely random strokes — attacker has never seen the signature or drawings.',
  },
  unskilled: {
    label: 'Unskilled (Saw It Once)',
    description: 'Heavy perturbation of real data — attacker glanced at the drawings and tries from memory.',
  },
  skilled: {
    label: 'Skilled (Practiced Copy)',
    description: 'Subtle perturbation of real data — attacker studied and practiced copying the drawings.',
  },
  replay: {
    label: 'Replay (Exact Copy)',
    description: 'Exact replay of enrolled stroke data — tests if stolen data can bypass authentication.',
  },
};

export async function runForgerySimulation(
  username: string,
  trialsPerLevel: number = 20,
): Promise<ForgerySimulationResult> {
  const user = await userRepo.findByUsername(username);
  if (!user) throw new Error(`User '${username}' not found`);
  if (!user.enrolled) throw new Error(`User '${username}' is not enrolled`);

  // Load enrolled data
  const sigBaseline = await sigRepo.getBaseline(user.id);
  if (!sigBaseline) throw new Error('No signature baseline found');

  const sigSamples = await sigRepo.getSamples(user.id);
  if (sigSamples.length === 0) throw new Error('No signature samples found');

  // Use first signature sample as the source for perturbation
  const sigSampleData = JSON.parse(sigSamples[0].stroke_data) as RawSignatureData;
  const baselineSigFeatures = JSON.parse(sigBaseline.avg_features) as AllFeatures;

  // Load shape/drawing enrolled data
  const shapeData: EnrolledData['shapeData'] = [];
  for (const shapeType of ALL_CHALLENGE_TYPES) {
    const [shapeSample, shapeBaseline] = await Promise.all([
      shapeRepo.getShapeSample(user.id, shapeType),
      shapeRepo.getShapeBaseline(user.id, shapeType),
    ]);
    if (!shapeSample || !shapeBaseline) continue;

    shapeData.push({
      type: shapeType,
      baseline: {
        biometric: JSON.parse(shapeBaseline.avg_biometric_features) as AllFeatures,
        shape: JSON.parse(shapeBaseline.avg_shape_features) as ShapeSpecificFeatures,
      },
      sampleData: JSON.parse(shapeSample.stroke_data) as RawSignatureData,
    });
  }

  const enrolled: EnrolledData = {
    sigBaseline: baselineSigFeatures,
    sigSampleData,
    shapeData,
  };

  // Get real user mean score from actual attempts
  const attempts = await authAttemptRepo.getAllAttempts(user.id);
  const realScores = attempts.filter(a => a.authenticated).map(a => a.score);
  const realUserMeanScore = realScores.length > 0
    ? realScores.reduce((a, b) => a + b, 0) / realScores.length
    : 0;

  // Run simulation for each forgery level
  const levels: ForgeryLevel[] = ['random', 'unskilled', 'skilled', 'replay'];
  const results: ForgeryLevelResult[] = [];

  for (const level of levels) {
    const trialDetails: ForgeryTrialResult[] = [];
    const scores: number[] = [];

    for (let i = 0; i < trialsPerLevel; i++) {
      const trial = scoreForgedAttempt(enrolled, level);
      trialDetails.push(trial);
      scores.push(trial.score);
    }

    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const passCount = trialDetails.filter(t => t.authenticated).length;

    results.push({
      level,
      label: LEVEL_METADATA[level].label,
      description: LEVEL_METADATA[level].description,
      trials: trialsPerLevel,
      scores,
      meanScore: Math.round(meanScore * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      minScore: Math.round(Math.min(...scores) * 100) / 100,
      maxScore: Math.round(Math.max(...scores) * 100) / 100,
      passCount,
      falseAcceptanceRate: Math.round((passCount / trialsPerLevel) * 10000) / 10000,
      trialDetails,
    });
  }

  return {
    username,
    threshold: THRESHOLDS.AUTH_SCORE_DEFAULT,
    realUserMeanScore: Math.round(realUserMeanScore * 100) / 100,
    runAt: new Date().toISOString(),
    trialsPerLevel,
    levels: results,
  };
}
