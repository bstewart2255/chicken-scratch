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
| `REAL_STDDEV_SCALE` | `2.0` | **NEW** — multiplies computed stddevs to close the enrollment/test-time variance gap. Applied in `computeStdDevs` only. Shipped after N=3 genuine attempts clustered at mean 80.9 σ 0.44 (thin margin) and daughter forgery sat at 60.6 (20-pt gap) — data shows ample headroom to widen genuine envelope. |
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

Data collected from two users on 2026-04-22:
- `demo-6d288749`: demo flow, mobile touch capture, no pressure, 1-sample enrollment, CV-prior stddevs.
- `t:0df005d7-.../demo-c11c20229039`: production flow, **desktop trackpad** capture (flat default pressure), 3-sample enrollment, real computed stddevs.

Device class matters — biometric distributions differ between mobile touch, stylus+pressure, and desktop trackpad. Treat these as separate calibration regimes; don't average their observations.

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

**Every attempt should record device class** — capture regime changes biometric distributions materially. Columns: `inputMethod` + `os` + `browser` (enough to disambiguate; `deviceClass` alone conflates phone-touch with tablet-stylus). See "Devices tested" below the tables.

**Demo flow (single-sample enrollment, CV-prior stddevs):**

| Attempt | Type | Device | Feature | DTW | Fused sig | Circle | House | Final | Threshold | Auth |
|---|---|---|---|---|---|---|---|---|---|---|
| Pre-tuning (1st run) | Genuine demo | iPhone touch | 48.21 | 0 | 19.28 | — | 72.40 | 36.01 | 80 | FAIL |
| Pre-tuning (2nd run) | Genuine demo | iPhone touch | 48.61 | 0 | 19.44 | 79.24 | 60.79 | 34.61 | 80 | FAIL |
| DTW-fix-only | Genuine demo | iPhone touch | 47.49 | 93.57 | 75.14 | 74.83 | 54.10 | 71.94 | 80 | FAIL |
| Priors-bumped | Genuine demo | iPhone touch | 85.98 | 92.72 | 90.02 | 86.73 | 81.76 | **88.29** | 80 | **PASS** |
| Priors-bumped | Self-forgery* | iPhone touch | 62.08 | 78.55 | 71.96 | 80.01 | 64.78 | **72.09** | 80 | FAIL ✓ |

*Self-forgery: "less curvy" signature, reverse-direction circle, different house with added door.

**Production flow (3-sample sig enrollment, real computed stddevs):**

| Attempt | Type | Device | Feature | DTW | Fused sig | Shapes (c/sq/tri/h/sm) | Final | Threshold | Auth |
|---|---|---|---|---|---|---|---|---|---|
| Priors-bumped | Genuine prod (1st) | macOS trackpad | 66.17 | 92.71 | 82.09 | 89.84/83.79/92.47/82.43/81.19 | **83.25** | 80 | **PASS** |
| `blair-mobile-7` genuine #1 | Genuine prod (mobile enroll → mobile verify, in-session) | iPhone touch | 65.55 | 92.27 | 81.58 | circle=82.84 square=89.49 triangle=91.92 house=69.44 smiley=69.25 | **81.28** | 80 | **PASS (margin +1.28)** |
| `blair-mobile-7` genuine #2 | Genuine prod (mobile verify, ~40 min after #1) | iPhone touch | 67.68 | 90.74 | 81.52 | circle=78.81 square=84.27 triangle=82.11 house=69.19 smiley=74.43 | **80.39** | 80 | **PASS (margin +0.39)** |
| `blair-mobile-7` genuine #3 | Genuine prod (mobile verify, ~40 min after #2) | iPhone touch | 64.88 | 93.35 | 81.96 | circle=80.66 square=82.20 triangle=82.45 house=78.25 smiley=70.93 | **81.04** | 80 | **PASS (margin +1.04)** |
| `blair-mobile-7` forgery #1 | **Daughter forgery** (unfamiliar with target's style) | iPhone touch | 30.22 | 77.65 | 58.68 | circle=68.90 square=73.99 triangle=71.52 house=55.28 smiley=55.00 | **60.56** | 80 | **FAIL (margin -19.44)** ✓ correctly rejected |
| `blair-mobile-7` genuine #4 | Genuine prod (4th verify, ~20 min after daughter forgery; scored against **pre-2×-stddev baseline**) | iPhone touch | 57.51 | 92.81 | 78.69 | circle=81.64 square=85.07 triangle=80.27 house=79.95 smiley=67.99 | **78.78** | 80 | **FAIL (margin -1.22)** ✗ false reject |
| `blair-mobile-9` genuine #1 | Genuine prod (1st verify on **post-2×-stddev + post-pressure-gate baseline**; fresh enrollment 2026-04-24) | iPhone touch | 81.22 | 94.44 | 89.15 | circle=87.75 square=82.93 triangle=89.73 house=81.70 smiley=86.43 | **88.12** | 80 | **PASS (margin +8.12)** ✓ validates 2× fix |

Genuine + daughter-forgery calibration run for `blair-mobile-7` account (mobile-enrolled, mobile-verified). Observations from N=3 genuine + N=1 forgery:

- **Genuine distribution extremely tight and grazing the threshold**: mean 80.90, σ 0.44, range 80.39–81.28. At 2σ, lower bound is 80.02 — roughly 5% false-reject rate if distribution holds. Unacceptable for a recovery product.
- **Daughter forgery landed at 60.56**, margin -19.44 below threshold. Feature=30.22 (timing=20.32 dominant drop), DTW=77.65 (DTW wasn't primary catcher). Timing was the #1 adversarial signal — same finding as the earlier pre-v3 wife-forgery analysis.
- **Forgery simulator (50 trials each level) on same user**: random FAR 0%, unskilled FAR 0%, skilled FAR 0%, skilled max score 48.84. Automated forgery has zero overlap with genuine.
- **Genuine-vs-forgery gap**: 20.3 points real (daughter), 32 points simulator-skilled. Plenty of room to widen the genuine tolerance without leaking forgery.

### Decision: apply `REAL_STDDEV_SCALE = 2.0`

Literature-backed fix (Plamondon-Djioua lognormal, Martinez-Diaz mobile DSV): enrollment-session variance understates test-time variance by 1.5-2×. Multiplying computed stddevs by 2.0 in `computeStdDevs` closes the gap.

Applied in `packages/backend/src/services/enrollment.service.ts::computeStdDevs`. Declared as `THRESHOLDS.REAL_STDDEV_SCALE`. Scaling applies only to the multi-sample path — `getDefaultStdDevs` already uses CV priors tuned for test-time variance, so it's not double-scaled.

**Expected effect (modeled, needs post-deploy validation)**:
- Genuine final: 80.90 → ~87-88 (feature score is the bucket-bottom pulling down; doubling σ unclamps many features that were sitting just outside their tolerance envelope)
- Daughter forgery: 60.56 → ~65 (most features still clamped at 0 regardless — they're way beyond 2×σ, not 1-2×σ)
- Genuine-forgery gap: 20 → 22-23 (widens because genuine was bounded by tolerance, forgery was bounded by distance)
- Threshold stays at 80 for now. Once post-tuning genuine lands where modeled, threshold can rise toward 85 (FIDO-aligned) in a follow-up.

**Rollback plan**: if post-deploy data shows genuine overshooting (>95) or forgery creeping above 70, revert scale to 1.5 or 1.0. One-line change.

**Post-ship data point reinforcing the fix (attempt #5 on `blair-mobile-7`)**: 20 min after the 2× stddev commit landed, user did another genuine verify on the SAME pre-fix baseline (stddevs weren't recomputed — baseline was built before the scale constant existed). Attempt scored **78.78 — FAILED threshold 80**. Timing bucket collapsed from previous ~80 to **44.28** while DTW remained stable at 92.81 and shapes all passed normally. 36-point swing on timing is a concrete demonstration of within-user test-time variance that enrollment-derived σ cannot anticipate. Back-of-envelope: under 2× σ that same attempt would have scored ~82-83 (timing bucket 44 → ~65 because features that sit *just outside* 1× tolerance move into *partial credit* under 2× tolerance).

Updated genuine distribution (N=4, all pre-fix baseline): mean 80.37, σ 1.06, min **78.78** (below threshold), max 81.28. False-reject rate = 25% on this small sample. Extremely urgent to validate the fix against a re-enrolled baseline.

**Next step**: user re-enrolls under a new email (the existing baseline is pre-fix; stored stddevs don't retroactively scale). Post-re-enrollment distribution from 3+ genuine attempts + 1-3 daughter informed-forgery attempts will confirm whether the 2× fix moves genuine into the expected 87-90 band while keeping forgery <75.

### Post-fix validation (blair-mobile-9, N=1)

Fresh enrollment on iPhone touch under the combined fixes (2× stddev scale + pressure variance gate). First verify:

| Bucket | Pre-fix (blair-mobile-7 avg) | Post-fix (blair-mobile-9 #1) | Δ |
|---|---|---|---|
| Final | 80.90 | **88.12** | **+7.22** |
| Feature | 66.04 | 81.22 | +15.18 |
| Kinematic | 37.49 | **76.19** | **+38.70** |
| Timing | 80.61 | 91.19 | +10.58 |
| Geometric | 76.97 | 79.04 | +2.07 |
| DTW | 92.12 | 94.44 | +2.32 (stable) |
| Pressure | 100 (phantom) | null (correctly skipped) | — |
| Avg shape | 79.08 | 85.71 | +6.63 |

Kinematic moved exactly as modeled — the 2× tolerance envelope unclamped features that were scoring 0 under the tight baseline. The pressure bucket correctly went null on iPhone touch (no flat-default phantom contribution anymore).

Still need distribution (N≥3) and daughter informed-forgery data to confirm:
- Genuine σ stays wide enough that the 88 isn't an outlier
- Forgery rejection holds — daughter's expected score range post-fix: 65-70. If she clears 75+, we over-tuned.

**Devices tested so far**:

| Device | Input | Real pressure? | Notes |
|---|---|---|---|
| iPhone + Safari | `touch` | No (all zeros) | Mobile demo. Pressure bucket returns null → no-pressure weight scheme. |
| macOS + Safari (trackpad) | `mouse` | No (flat default ~0.5) | Desktop production enrollment. **`supportsPressure=true` is misleading here — the browser returns a constant default, not a real sensor reading. Pressure bucket scores 100 on matching defaults, which is spurious signal.** Candidate fix: treat `inputMethod=mouse` as "no pressure" in the extractor regardless of per-point values. |

**Untested devices** (worth collecting data on): Apple Pencil on iPad, Wacom tablet on desktop (both have real pressure), mouse on Windows Chrome, Android finger touch, Android stylus.

**Observations**:

Demo flow:
- Kinematic CV=0.50 was correct — moved kinematic bucket score from 9.52 (crushed) to 96.41 (fine)
- DTW stably scored 92-94 on genuine repeats, 78.55 on deliberate self-forgery
- **Circle opposite-direction only penalized 7 points** — direction histogram may be under-weighted, or most circle features are direction-agnostic (closure, radial consistency, bounding box). Open issue.
- Timing was the biggest forgery signal on self-forgery (-46 points), kinematic the smallest (-5). Users who change style tend to keep velocity but change rhythm.
- Self-forgery margin: 7.91 points below threshold. Genuine margin: 8.29 points above. Thin symmetric gap.

Production flow — DESKTOP TRACKPAD (1 genuine attempt so far — NOT enough for tuning):
- **Device class is desktop trackpad**, not mobile touch. All prior calibration was on mobile demo. Different biometric regime:
  - Pressure is a flat default reported by the browser on trackpad input, not a real sensor reading. Mahalanobis sees matching values on both sides → pressure bucket scores 100 without contributing real biometric signal. Treat this 100 as spurious. **Pressure bucket weighting (0.15 with-pressure) is currently rewarding a no-op on this device class** — that's a latent bug, see open questions.
  - Velocity/acceleration profiles differ from touch — friction-based cursor drag vs. finger flick
  - Trackpad input is often slower and more deliberate than touch
  - CV priors were tuned for mobile demo; may not fit desktop trackpad
- DTW [91.17, 92.38, 92.71] across all 3 enrollment samples — max-of-N picked up a consistent genuine signal even on trackpad. DTW seems device-agnostic.
- **Kinematic collapsed to 33.93.** Likely two-factor: (a) enrollment σ < test-time σ (known DSV problem — 3 enrollment samples captured in one focused session underestimate real variation), (b) trackpad-vs-touch kinematic distribution mismatch against mobile-tuned priors.
- **Margin only 3.25 points above threshold.** Uncomfortably thin for a single pass. Need 4 more genuine attempts on this same device class to see the distribution width before retuning.
- Shape-specific score on smiley = 68.89 (vs triangle 100, circle 91) — may indicate smiley features are noisier on trackpad, or the user's smiley differs more stroke-to-stroke. Worth watching across repeats.

### Device-capability detection bug — fixed, but invalidates early production data

**What broke**: `detectDeviceCapabilities()` in `packages/frontend/src/lib/device-capabilities.ts` and `detectCapabilities()` in `packages/sdk/src/device.ts` both had:

```typescript
if (supportsTouch && supportsPressure) inputMethod = 'stylus';
```

But `supportsPressure` only tests whether the PointerEvent API exposes a `pressure` field — **not** whether a stylus is in use. iPhone Safari reports `true` with a finger. So every iPhone finger-touch enrollment got classified as `inputMethod='stylus'`, which cascaded through `detectDeviceClass` (which maps stylus → desktop) to a `device_class='desktop'` baseline.

**What this looks like in data**: the "mobile enrollment" the user did with their finger on iPhone on 2026-04-22 21:33 UTC produced samples with:
```
inputMethod: 'stylus'   ← wrong
os: 'iOS'
device_class: 'desktop' ← cascaded wrong classification
```

Subsequent verify on MacBook trackpad (inputMethod=mouse → device_class=desktop) matched that baseline instead of bouncing on DEVICE_CLASS_MISMATCH. Score 43.16 (garbage — cross-modality). The failure mode was invisible: no error, just low score.

**Fix (pushed alongside this log update)**: drop the `supportsPressure` condition. Touchscreen → `inputMethod='touch'`, period. Real stylus disambiguation requires `PointerEvent.pointerType === 'pen'` at draw time, which is not wired yet — noted as a future refinement but not blocking.

**Data impact**: the desktop-production attempt logged earlier in this doc (`macOS trackpad, 83.25`) was NOT affected — that was mouse input, correctly classified all along. But the 2026-04-22 21:33 iPhone attempt's baseline is mis-classified and needs to be deleted + re-enrolled under the corrected classification. User has the admin endpoint for this.

**Open cleanup**: any existing baseline with `device_class='desktop'` AND enrollment samples showing `inputMethod='stylus' + os='iOS'` is miscast. Not worth a DB migration given prod usage is ~one tester right now, but add to a future "pilot launch checklist" item.

---

## Open calibration questions

1. **DTW decay constant k=5** — on self-forgery DTW only dropped 14 points (92.72 → 78.55). Too forgiving? Try k=7–10 and compare.
2. **Circle direction-sensitivity** — 7-point penalty for drawing opposite direction is weak. Options: (a) weight `directionHist*` bins more heavily, (b) add explicit stroke-sequence encoding feature, (c) reverse-sensitivity check on the circle-specific shape features.
3. **Enrollment underestimates test-time variance** (new finding from first production attempt) — the matcher's computed σ across 3 enrollment samples is tighter than the user's σ at verify time because enrollment samples are captured in one focused session. Kinematic bucket scored 33.93 on a genuine verify despite correct feature extraction. Fix options, in order of preference:
   - (a) Raise `MIN_REL_STDDEV` floor from 0.10 → 0.20 (cheap, blunt)
   - (b) Multiply computed stddevs by a constant `REAL_STDDEV_SCALE` (e.g. 2.0) to account for the enrollment/test-time variance gap (principled, cites DSV literature)
   - (c) Raise `MAHALANOBIS_K` from 3.0 → 4.0 (most general, affects every code path)
   Need more production data points before choosing — see "Next calibration step" below.
4. **Threshold** — currently 80/65/35/35 as safety valve. Real goal is 85/75/40/40 (FIDO-aligned). Raise after calibration proves genuine distribution doesn't graze the gate. First production attempt hit 83.25 — margin only 3.25 points. If next 4 attempts land similarly, threshold 80 is the ceiling, not a safety valve.
5. **CV priors per-population** — current priors are tuned from one blair demo run. Do they hold for other users? Different hand shapes, pen vs finger, mobile vs desktop?
6. **Bucket weights** — `pressure 0.15 / timing 0.20 / kinematic 0.25 / geometric 0.40` (with pressure) are research priors. Never measured whether kinematic or geometric should dominate.
7. **Smiley shape-specific features** — first production attempt scored smiley shape-feat at 68.89 (vs triangle 100, circle 91, square 86). Either the user's smiley varies more stroke-to-stroke, or one of the 4 smiley features (featurePlacement / strokeSequencing / facialSymmetry / componentProportions) has a calibration issue. Watch across repeat verifies.
8. **Misleading `supportsPressure` flag** — on `inputMethod=mouse` (trackpad) Safari returns `supportsPressure=true` and a flat default pressure value (~0.5). The extractor's `hasPressureData` check is `some(p.pressure > 0)`, which trips positive on this default, so the pressure bucket gets computed and scores 100 on baseline↔attempt identical defaults — spurious signal contributing 15% bucket weight to the overall score. **Proposed fix**: in `hasPressureData`, also require variance — `pressure > 0 AND not all points have the same pressure value`. Or gate on `inputMethod` directly: only `stylus` gets the pressure bucket. Decide after more device data comes in.
9. **Per-device-class priors** — iPhone touch and macOS trackpad produced very different score distributions. A single set of CV priors may not fit both regimes. Options: (a) separate prior sets per device class, (b) wider universal priors that fit all cases (at cost of weaker matching), (c) defer — the production flow uses real stddevs once you have 3 samples, so prior mismatch matters less per-user-per-enrollment anyway.

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

**For every real-attempt data point logged, always capture**:
- `inputMethod` (touch / mouse / stylus)
- `os` (iPhone / macOS / Android / Windows / ...)
- `browser` (Safari / Chrome / Firefox / ...)
- Whether real pressure data was captured (pressures vary) or a flat default was reported

Pull via `GET /api/diagnostics/users/<username>/attempts` — each attempt includes `deviceCapabilities.{inputMethod, os, browser, supportsPressure}`. Note that `supportsPressure=true` is not reliable; verify by inspecting whether the stroke pressures have meaningful variance.

Different capture regimes (phone touch vs stylus+pressure vs desktop mouse) produce different biometric distributions. Don't average across them — log and analyze separately.
