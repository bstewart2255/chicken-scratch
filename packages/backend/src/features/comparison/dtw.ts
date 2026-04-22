import type { RawSignatureData } from '@chicken-scratch/shared';

/**
 * Multivariate Dynamic Time Warping over signature trajectories.
 *
 * Returns a 0-100 similarity score. This matcher is a parallel alternative
 * to the feature-based biometric score — it captures per-point temporal
 * alignment (which stroke happened when, how velocity and pressure shifted
 * moment-to-moment) that scalar feature averaging cannot.
 *
 * NOT YET WIRED INTO THE AUTHENTICATION DECISION. Available for benchmarking
 * and fusion experiments. The decay constant `k` and dimension weights are
 * first-cut defaults that will need empirical calibration (see
 * `docs/scoring-research.md` section 3).
 */

interface NormalizedPoint {
  x: number;
  y: number;
  pressure: number;
  vx: number;
  vy: number;
}

interface RawFlatPoint {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

function flattenAndNormalize(data: RawSignatureData): NormalizedPoint[] {
  const flat: RawFlatPoint[] = [];
  for (const stroke of data.strokes) {
    for (const p of stroke.points) {
      flat.push({ x: p.x, y: p.y, pressure: p.pressure, timestamp: p.timestamp });
    }
  }
  if (flat.length < 2) return [];

  const cx = flat.reduce((s, p) => s + p.x, 0) / flat.length;
  const cy = flat.reduce((s, p) => s + p.y, 0) / flat.length;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of flat) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;

  const out: NormalizedPoint[] = [];
  for (let i = 0; i < flat.length; i++) {
    const prev = flat[Math.max(0, i - 1)];
    const dt = flat[i].timestamp - prev.timestamp || 1;
    const vx = ((flat[i].x - prev.x) / dt) * 100;
    const vy = ((flat[i].y - prev.y) / dt) * 100;
    out.push({
      x: (flat[i].x - cx) / diag,
      y: (flat[i].y - cy) / diag,
      pressure: flat[i].pressure,
      vx,
      vy,
    });
  }
  return out;
}

// Weighted squared Euclidean distance across 5 dimensions.
// xy weighted higher than pressure/velocity because trajectory shape is the
// dominant per-point signal; velocity is derived and noisier.
const DEFAULT_WEIGHTS = [1.0, 1.0, 0.5, 0.3, 0.3] as const;

function pointDistance(
  a: NormalizedPoint,
  b: NormalizedPoint,
  w: readonly number[],
): number {
  const d =
    w[0] * (a.x - b.x) ** 2 +
    w[1] * (a.y - b.y) ** 2 +
    w[2] * (a.pressure - b.pressure) ** 2 +
    w[3] * (a.vx - b.vx) ** 2 +
    w[4] * (a.vy - b.vy) ** 2;
  return Math.sqrt(d);
}

/**
 * DTW distance with Sakoe-Chiba band constraint. Length-normalized.
 * Returns a non-negative distance; 0 = identical sequences.
 */
export function dtwDistance(
  a: NormalizedPoint[],
  b: NormalizedPoint[],
  weights: readonly number[] = DEFAULT_WEIGHTS,
  bandPct = 0.1,
): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return Infinity;

  // Band prevents pathological warping (aligning all of A to one point in B)
  // and bounds compute to O(band * max(m,n)) instead of O(m*n).
  // Must be >= |m - n| or the final cell (m, n) is unreachable when the
  // sequences differ significantly in length.
  const band = Math.max(
    Math.round(bandPct * Math.max(m, n)),
    Math.abs(m - n) + 10,
    10,
  );

  // Rolling two-row buffer: we only ever read the previous row and the
  // in-progress current row. Memory is O(n) instead of O(m*n).
  let prev = new Array<number>(n + 1).fill(Infinity);
  let curr = new Array<number>(n + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= m; i++) {
    curr.fill(Infinity);
    const jStart = Math.max(1, i - band);
    const jEnd = Math.min(n, i + band);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = pointDistance(a[i - 1], b[j - 1], weights);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  const final = prev[n];
  if (!Number.isFinite(final)) return Infinity;
  return final / (m + n);
}

/**
 * Map a DTW distance to a 0-100 similarity via exponential decay.
 * Decay constant chosen so that typical same-signer distances (~0.1-0.2 on
 * normalized strokes) map to similarity in the 60-90 range. This is a
 * placeholder calibration — see section 4 of the research doc for the
 * proper benchmark-driven calibration procedure.
 */
function decay(distance: number, k = 5): number {
  if (!Number.isFinite(distance)) return 0;
  return Math.round(Math.exp(-k * distance) * 10000) / 100;
}

export function computeDtwSimilarity(
  stored: RawSignatureData,
  attempt: RawSignatureData,
): number {
  const a = flattenAndNormalize(stored);
  const b = flattenAndNormalize(attempt);
  if (a.length === 0 || b.length === 0) return 0;
  const distance = dtwDistance(a, b);
  return decay(distance);
}

/**
 * Score an attempt against multiple enrolled stroke samples, returning both
 * the per-sample similarities and the aggregate. Aggregation strategy:
 * **max-of-N** (best-match-against-any-enrolled-sample). This is the
 * single-template convention from the DSV literature (Kholmatov & Yanikoglu,
 * BioSecure) — it's more permissive than mean-of-N and captures the user's
 * natural stroke-to-stroke variation better than any single reference.
 *
 * Returns { best, perSample } so diagnostics can show which enrollment
 * sample the attempt resembled most (useful for debugging "why did my
 * verify fail" and for identifying stale enrollments).
 */
export function computeDtwSimilarityAgainstSamples(
  storedSamples: RawSignatureData[],
  attempt: RawSignatureData,
): { best: number; perSample: number[] } {
  if (storedSamples.length === 0) {
    return { best: 0, perSample: [] };
  }
  const perSample = storedSamples.map(s => computeDtwSimilarity(s, attempt));
  const best = perSample.reduce((m, v) => (v > m ? v : m), 0);
  return { best, perSample };
}

// Exported for tests.
export const __test__ = {
  flattenAndNormalize,
  pointDistance,
  DEFAULT_WEIGHTS,
};
