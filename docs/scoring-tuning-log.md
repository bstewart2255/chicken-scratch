# Scoring tuning log

Running record of scoring-system changes, calibration decisions, and the empirical data backing each tuning step. **Sibling to `docs/scoring-research.md`** — the research doc is "what the field does"; this doc is "what we've done and why."

**Intended audience**: a future Claude session (or human) picking up calibration without the preceding chat context. This doc should stand alone.

---

## Current state (read this first)

### Running versions and parameters

| Surface | Value | Rationale / source |
|---|---|---|
| `FEATURE_VERSION` | `3.0.0` | PR #1 — new feature schema, version guard active in `compareFeatures` |
| Matcher type | Mahalanobis with DTW fusion | PR #2 wired Mahalanobis; PR #3 added DTW fusion |
| `MAHALANOBIS_K` | `3.0` | Bumped from initial 2.5 (f542219). Real biometric CV is higher than 2.5σ allows. |
| `MIN_REL_STDDEV` | `0.10` | Bumped from 0.05 (f542219). Small-magnitude features were hitting floor. |
| `MIN_ABS_STDDEV` | `1e-3` | Unchanged; divide-by-zero guard |
| `DTW_FUSION_WEIGHT` | `0.6` | Sum-rule prior from Fierrez-Aguilar 2005. Untuned empirically. |
| `AUTH_SCORE_DEFAULT` | `80` | **Temporarily relaxed** from 85. Calibration safety valve. |
| `SIGNATURE_MIN_THRESHOLD` | `65` | **Temporarily relaxed** from 75. |
| `SHAPE_MIN_THRESHOLD` | `35` | **Temporarily relaxed** from 40. |
| `DRAWING_MIN_THRESHOLD` | `35` | **Temporarily relaxed** from 40. |

### Bucket weights (signature scoring)

```
With pressure:    pressure 0.15 | timing 0.20 | kinematic 0.25 | geometric 0.40
Without pressure: —            | timing 0.25 | kinematic 0.30 | geometric 0.45
```

First-cut priors (PR #1). Never empirically calibrated.

### CV priors (`getDefaultStdDevs`)

Used for single-sample enrollments (demo mode) and shape baselines (one sample per shape type):

| Bucket | CV prior | History |
|---|---|---|
| timing | `0.30` | Bumped from 0.15 (f542219) |
| kinematic | `0.50` | Bumped from 0.18 (f542219) — the critical miss |
| geometric | `0.25` | Bumped from 0.12 (f542219) |
| pressure | `0.20` | Bumped from 0.10 (f542219) |

Multi-sample production enrollments use real computed stddevs instead (`computeStdDevs`), so these priors only matter for demo.

### DTW configuration

- Dimensions: `(x, y, pressure)` — 3-dim, **not** 5-dim
- Dimension weights: `[1.0, 1.0, 0.5]`
- Distance decay: `exp(-5 * normalized_dtw_distance)` — k=5 untuned
- Sakoe-Chiba band: 10% of max(m, n) or |m-n|+10, whichever is larger
- Aggregation across N enrollment samples: `max` (best-of-N)

### Scoring tree (verbose)

```
finalScore = signatureScore * 0.7 + mean(shapeCombinedScores) * 0.3

signatureScore = scoreSignatureAttempt() =
    DTW_FUSION_WEIGHT * dtw.bestOfN(enrollmentStrokes, attempt)
  + (1 - DTW_FUSION_WEIGHT) * compareFeatures(baseline, attempt, stddevs)
                              (Mahalanobis, weighted across pressure/timing/kinematic/geometric)

shapeCombinedScore = biometric(70%) + shape-specific(30%)
  biometric = compareFeatures(shapeBaseline, attemptBio, shapeStddevs)
              ← uses Mahalanobis with CV-prior-derived stddevs (shapes enroll 1 sample each)
  shape-specific = per-shape features (circle/square/triangle/house/smiley), 4 each, relative-error

Gates (ALL must pass):
  signatureScore >= SIGNATURE_MIN_THRESHOLD (65)
  every shape.combinedScore >= SHAPE_MIN_THRESHOLD (35)
  finalScore >= AUTH_SCORE_DEFAULT (80)
```

### What's NOT calibrated empirically yet

Everything in the parameter table above is a prior, not a measurement. Values that would most benefit from empirical data:

1. `DTW_FUSION_WEIGHT` — is 0.6 right, or should DTW carry more/less?
2. DTW decay constant `k=5` — first prod self-forgery saw DTW drop only 14 points; may be too forgiving
3. CV priors — tuned from a single user's demo sample (bstew510 / demo-6d288749)
4. Four thresholds — relaxed during rollout, should move back toward 85/75/40/40 if data supports
5. Bucket weights — never tuned, just research priors

---

## Tuning chronology

### Baseline: the original concern (pre-v3)

User reported wife forgery attempt scored 81% (signature), 78% (house), 76% (circle) — "Forgery Rejected" outcome but scores felt uncomfortably close to passing.

Analysis: the legacy relative-error matcher (`1 - |a-b| / max(|a|, |b|)`) has a natural ~40-50% floor because every signature shares some similarity by virtue of being on-canvas and of similar size. Led to both the research pass (`docs/scoring-research.md`) and the full three-PR tuning arc below.

---

### PR #1 — Feature schema v3 (commit [8b68807](https://github.com/bstewart2255/chicken-scratch/commit/8b68807))

Merged 2026-04-22. First ship of the full v3 feature set.

**Dropped**:
- `PressureFeatures.pressureRange` (redundant with max−min)
- `TimingFeatures.pauseDetection` (redundant with `pauseTimeRatio`)
- `GeometricFeatures.spatialEfficiency` (replaced with bbox features)
- `SecurityFeatures` bucket entirely (demoted to `diagnosticFlags` — not scored, exposed for anomaly review)

**Added**:
- `KinematicFeatures` (NEW bucket — 6 features): velocityAvg/Max/Std, velocityAtPenDown, accelerationAvg/Max
- Timing: `penUpDurationMean/Std`
- Geometric: bboxWidth/Height, aspectRatio, centroidX/Y, strokeCount, penDownCount, penUpCount, criticalPointCount, directionHist0–7 (8 bins)

**Other**:
- Migration 018 truncated prod baselines (prod was empty at the time — verified)
- Added `FeatureVersionMismatchError` — runtime guard in `compareFeatures` rejects baseline-version ≠ attempt-version to prevent silent score corruption
- `FEATURE_VERSION` bumped 2.0.0 → 3.0.0

**API breaking change (intentional)**: `FeatureComparison.breakdown.security` removed; `diagnosticFlags` added as sibling.

### PR #2 — Per-user Mahalanobis scaling (commit [5657425](https://github.com/bstewart2255/chicken-scratch/commit/5657425))

Merged 2026-04-22.

**Matcher change**: replaced `similarity = 1 - |a-b| / max(|a|, |b|)` with:
```
similarity = max(0, 1 - |a-b| / (k · max(σ, floor)))
```
where σ = user-specific standard deviation per feature, k = Mahalanobis tolerance multiplier.

**Initial constants** (later tuned):
- `MAHALANOBIS_K = 2.5` → **later 3.0** (f542219)
- `MIN_REL_STDDEV = 0.05` → **later 0.10** (f542219)
- `MIN_ABS_STDDEV = 1e-3` (unchanged)

**Storage**:
- Signature baselines already had `feature_std_devs` column (migration 001)
- Migration 019 added `shape_baselines.biometric_std_devs` column (nullable)
- Demo (single-sample) + shape (single-sample) use `getDefaultStdDevs(baseline)` — CV-prior × baseline magnitude
- Production (multi-sample) signature enrollments compute real stddevs from N samples

**Threshold relaxations** (transitional, still active):
- `AUTH_SCORE_DEFAULT` 85 → 80
- `SIGNATURE_MIN_THRESHOLD` 75 → 65
- `SHAPE_MIN_THRESHOLD` 40 → 35
- `DRAWING_MIN_THRESHOLD` 40 → 35

**Latent bug fixed**: old `getDefaultStdDevs` returned fixed absolute values (e.g. 0.12) that were nonsensical across features with wildly different magnitudes. Rewrote to use CV-prior × baseline magnitude.

### PR #3 — DTW fusion (commit [3c7d272](https://github.com/bstewart2255/chicken-scratch/commit/3c7d272))

Merged 2026-04-22.

Wired the existing `dtw.ts` module (shipped unwired in PR #1) into the signature verification path via sum-rule fusion:

```
finalSignatureScore = DTW_FUSION_WEIGHT · dtwScore + (1 - DTW_FUSION_WEIGHT) · featureScore
```

Default `DTW_FUSION_WEIGHT = 0.6` (Fierrez-Aguilar 2005 prior).

**Aggregation**: max-of-N best-match across the user's enrollment samples (single-template convention from Kholmatov & Yanikoglu).

**Scope**: signatures only. Shapes stay on Mahalanobis feature-only scoring (one enrollment sample per shape → no multi-sample DTW advantage; shapes are calibration prompts so sequence-alignment has smaller edge).

**API additive fields**: `FeatureComparison` gains optional `dtwScore`, `dtwScores`, `featureScore`.

**Graceful degradation**: when no enrollment samples available, falls back to feature-only score (no dtw fields in response).

---

### Hotfix: DTW velocity scaling bug (commit [a7f2631](https://github.com/bstewart2255/chicken-scratch/commit/a7f2631))

Post-PR #3 deploy, first real genuine verify scored `dtwScore: 0` despite being a same-session repeat. Root cause:

```typescript
const vx = ((flat[i].x - prev.x) / dt) * 100;   // raw px/ms × 100 → values 25-200
x: (flat[i].x - cx) / diag,                     // normalized to [-0.5, 0.5]
```

Velocity values were 2-3 orders of magnitude larger than normalized xy. In the weighted Euclidean even at w=0.3, velocity completely dominated; any small timing variance blew the DTW distance past `exp(-5·d)`'s numerical floor → similarity rounded to 0.

**Fix**: dropped velocity from DTW entirely. Matcher is now 3-dim `(x, y, pressure)` — matches Kholmatov & Yanikoglu and most SVC-2004 submissions. Velocity information is implicit in how the DTW path warps the time axis.

**Regression test added** — a signature drawn with ±2px position jitter and ±5ms timing jitter must score ≥ 70 in DTW.

---

### Hotfix: Mahalanobis priors too tight (commit [f542219](https://github.com/bstewart2255/chicken-scratch/commit/f542219))

Post-DTW-fix, first genuine verify scored 71.94 — failed threshold 80. Breakdown revealed:

```
timing    65.36
kinematic  9.52   ← crushed
geometric 62.87
```

Kinematic bucket collapsed near zero because real same-user velocity/acceleration CV is 30-50% (Plamondon lognormal theory, Martinez-Diaz) but my prior was 0.18.

**Tuning**:
- CV_PRIOR.timing: 0.15 → 0.30
- CV_PRIOR.kinematic: 0.18 → 0.50 (critical miss)
- CV_PRIOR.geometric: 0.12 → 0.25
- CV_PRIOR.pressure: 0.10 → 0.20
- MAHALANOBIS_K: 2.5 → 3.0
- MIN_REL_STDDEV: 0.05 → 0.10

After deploy, same user's next genuine verify scored **88.29** (passed).

---

### Deploy / infra side-quest

Three commits addressed the "tsc: not found" build failure:

- [e0293d4](https://github.com/bstewart2255/chicken-scratch/commit/e0293d4) — prepend `npm install` (didn't help: NODE_ENV=production silently stripped devDeps)
- [2dff92c](https://github.com/bstewart2255/chicken-scratch/commit/2dff92c) — switch to `npm ci --include=dev` (hit EBUSY on Railway's Docker cache mount)
- [cebc5ab](https://github.com/bstewart2255/chicken-scratch/commit/cebc5ab) — `npm install --include=dev` (finally worked: non-destructive + explicit devDeps override)

Root cause: `NODE_ENV=production` is set on the chicken-scratch Railway service. Both `npm ci` and `npm install` silently omit devDependencies under that flag unless `--include=dev` is explicit.

---

## Empirical data collected so far

All data from user `demo-6d288749` (blair's demo enrollment on 2026-04-22 19:13 UTC). Single-sample enrollment. Touch input (no pressure).

### Forgery simulator — pre-tuning (PR #1 baseline, pre-Mahalanobis)

Historical point of reference — collected earlier in the tuning thread on an older PR #1 user:

| Level | mean | stdDev | min | max | FAR |
|---|---|---|---|---|---|
| random | 37.27 | 4.56 | 28.87 | 44.89 | 0% |
| unskilled | 32.38 | 1.77 | 29.49 | 36.77 | 0% |
| skilled | 37.50 | 2.23 | 30.75 | 41.40 | 0% |
| replay | 100 | 0 | 100 | 100 | 100% |

Real-user genuine mean: 91.1.

### Forgery simulator — post-tuning (f542219)

Collected on `demo-6d288749` after PR #2 + PR #3 + DTW fix + priors bump:

| Level | mean | stdDev | min | max | FAR |
|---|---|---|---|---|---|
| random | 32.47 | 1.47 | 28.75 | 36.07 | 0% |
| unskilled | 37.45 | 2.08 | 33.59 | 41.36 | 0% |
| skilled | 48.01 | 0.89 | 45.46 | 49.86 | 0% |
| replay | 100 | 0 | 100 | 100 | 100% |

Real-user genuine single data point: 88.29.

**Separation**: genuine 88.29 vs simulator-skilled max 49.86 → gap of ~38 points. Forgery simulator 0% FAR on all non-replay levels.

### Real-attempt log

| Attempt | Type | Feature | DTW | Fused sig | Circle | House | Final | Threshold | Auth |
|---|---|---|---|---|---|---|---|---|---|
| Pre-tuning (1st run) | Genuine demo | 48.21 | 0 | 19.28 | — | 72.40 | 36.01 | 80 | FAIL |
| Pre-tuning (2nd run) | Genuine demo | 48.61 | 0 | 19.44 | 79.24 | 60.79 | 34.61 | 80 | FAIL |
| DTW-fix-only | Genuine demo | 47.49 | 93.57 | 75.14 | 74.83 | 54.10 | 71.94 | 80 | FAIL |
| Priors-bumped | Genuine demo | 85.98 | 92.72 | 90.02 | 86.73 | 81.76 | **88.29** | 80 | **PASS** |
| Priors-bumped | Self-forgery* | 62.08 | 78.55 | 71.96 | 80.01 | 64.78 | **72.09** | 80 | FAIL ✓ |

*Self-forgery: "less curvy" signature, reverse-direction circle, different house with added door.

**Observations from real data**:
- Kinematic CV=0.50 was correct — moved kinematic bucket score from 9.52 (crushed) to 96.41 (fine)
- DTW stably scored 92-94 on genuine repeats, 78.55 on deliberate self-forgery
- **Circle opposite-direction only penalized 7 points** — direction histogram may be under-weighted, or most circle features are direction-agnostic (closure, radial consistency, bounding box). Open issue.
- Timing was the biggest forgery signal on self-forgery (-46 points), kinematic the smallest (-5). Users who change style tend to keep velocity but change rhythm.
- Self-forgery margin: 7.91 points below threshold. Genuine margin: 8.29 points above. Thin symmetric gap.

---

## Open calibration questions

1. **DTW decay constant k=5** — on self-forgery DTW only dropped 14 points (92.72 → 78.55). Too forgiving? Try k=7–10 and compare.
2. **Circle direction-sensitivity** — 7-point penalty for drawing opposite direction is weak. Options: (a) weight `directionHist*` bins more heavily, (b) add explicit stroke-sequence encoding feature, (c) reverse-sensitivity check on the circle-specific shape features.
3. **Multi-sample production variance** — all calibration so far is from single-sample demo. Production 3-sample enrollment will use `computeStdDevs(samples)` (real empirical variance), which should:
   - Tighten genuine tolerance (less prior uncertainty)
   - Widen genuine-vs-forgery gap
   - Potentially allow threshold to rise back toward 85
4. **Threshold** — currently 80/65/35/35 as safety valve. Real goal is 85/75/40/40 (FIDO-aligned). Raise after calibration proves genuine distribution doesn't graze the gate.
5. **CV priors per-population** — current priors are tuned from one blair demo run. Do they hold for other users? Different hand shapes, pen vs finger, mobile vs desktop?
6. **Bucket weights** — `pressure 0.15 / timing 0.20 / kinematic 0.25 / geometric 0.40` (with pressure) are research priors. Never measured whether kinematic or geometric should dominate.

---

## Next calibration step: production-flow data

In progress as of this document write. Protocol:

1. User runs 1 full **production** enrollment: 3 signatures + 5 shapes (circle, square, triangle, house, smiley)
2. 5 genuine verifies by the enrolled user (across sessions if possible)
3. 5 forgery attempts by a non-enrolled-user (blair's wife)
4. Collect all 10 attempt scores from `/api/diagnostics/users/<username>/attempts`
5. Analyze:
   - Width of genuine distribution (mean, stddev, min)
   - Width of forgery distribution (mean, stddev, max)
   - Overlap point → suggested threshold
   - Which bucket/feature had largest variance within genuine, largest separation across distributions

Production should give objectively better calibration because:
- Real computed stddevs instead of CV-prior defaults (`computeStdDevs` vs `getDefaultStdDevs`)
- 5 shapes instead of 2 (more independent discriminators)
- This is the flow customers actually use; calibrating here matters for pilot readiness

---

## PRs queued after current calibration

(Reference, from earlier in the tuning thread)

4. **3 → 5 enrollment samples** — UX change. Pros: tighter variance estimate, lower EER by ~1 point. Cons: longer enroll funnel.
5. **SVC-2004 benchmark harness** — independent track. Publish an EER number against the canonical public dataset. Pilot-credibility artifact.

Less urgent but worth noting:

- **Shape DTW** (currently deferred) — shapes might benefit from DTW too if we collect multiple enrollment samples per shape type.
- **Direction-sensitivity fix** — address the circle-reverse issue called out above.
- **Per-device-class priors** — mobile touch vs desktop stylus may have different natural CVs.

---

## File / module reference

| Purpose | File |
|---|---|
| Feature types | `packages/shared/src/types/features.ts` |
| Thresholds & constants | `packages/shared/src/constants/thresholds.ts` |
| Feature extraction (orchestrator) | `packages/backend/src/features/extraction/index.ts` |
| Pressure features | `packages/backend/src/features/extraction/pressure.ts` |
| Timing features | `packages/backend/src/features/extraction/timing.ts` |
| Kinematic features (NEW in v3) | `packages/backend/src/features/extraction/kinematic.ts` |
| Geometric features | `packages/backend/src/features/extraction/geometric.ts` |
| Diagnostic flags (prev. security) | `packages/backend/src/features/extraction/diagnostic-flags.ts` |
| Mahalanobis matcher + version guard | `packages/backend/src/features/comparison/biometric-score.ts` |
| DTW matcher | `packages/backend/src/features/comparison/dtw.ts` |
| Signature DTW+feature fusion | `packages/backend/src/features/comparison/signature-fusion.ts` |
| Shape matcher | `packages/backend/src/features/comparison/shape-score.ts` |
| Final signature+shape combiner | `packages/backend/src/features/comparison/combined-score.ts` |
| Enrollment service (avg + stddev compute) | `packages/backend/src/services/enrollment.service.ts` |
| Verify path (signature + full) | `packages/backend/src/services/auth.service.ts` |
| Forgery simulator | `packages/backend/src/services/forgery-simulator.ts` |
| Signature baseline storage | `packages/backend/src/db/repositories/signature.repo.ts` |
| Shape baseline storage | `packages/backend/src/db/repositories/shape.repo.ts` |
| DB migrations | `packages/backend/src/db/migrations/` (001–019) |
| Research reference | `docs/scoring-research.md` |
| **This doc** | `docs/scoring-tuning-log.md` |

---

## How to continue this log

Append new sections chronologically. For each change:
1. What changed (parameter / code path / threshold)
2. Commit hash and date
3. Empirical data that drove the decision (before/after scores, forgery-sim delta)
4. Updated "current state" table at the top if a parameter value changed
5. Any new open questions discovered
