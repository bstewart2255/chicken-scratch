# ChickenScratch Scoring Design vs. Online Signature Verification Best Practice

_Research compiled 2026-04-21. See Key References at bottom._

## 1. Executive Summary

ChickenScratch's scoring design is **clearly behind current DSV best practice, but in ways that are fixable without ML infrastructure**. The features chosen are in the right thematic buckets (pressure, timing, geometry, security) and overlap meaningfully with the Fierrez-Aguilar canonical global feature set — so the system is not on the wrong track conceptually. But the core matching operation, `1 - |stored - attempt| / max(|stored|, |attempt|)` averaged per feature, is the weakest link in the entire pipeline: it throws away all the sequential / functional information that gives online signatures their discriminative power. Every serious DSV system since at least Sato & Kogure (1982) uses some form of time-series alignment (DTW or HMM), and every modern one (2019+) uses a neural encoder over the time series. Per-feature averaging puts chickenScratch closer to offline (image-based) signature verification than online DSV, despite capturing rich online data.

**Single biggest gap:** no time-series alignment. A DTW layer over (x, y, pressure, velocity) trajectories — bolted on beside the current 26-feature score, with equal-weight score-level fusion — is the one change most likely to move measured EER from "unknown / probably 8-15%" into the "3-6% on skilled forgeries" range that would be credible in a pilot.

The shapes + drawings auxiliary modality **is a legitimately novel angle** and worth leaning into for the pilot narrative, because published multi-modal behavioral fusion has focused on combining signature with face, voice, or keystroke — not with calibration shapes drawn by the same hand in the same session.

---

## 2. Feature Set Comparison: Canonical ~100 vs. ChickenScratch ~26

The canonical global feature set most often cited is from Fierrez-Aguilar et al. (2005, ICB / Pattern Recognition Letters 2007) and Martinez-Diaz / Fierrez "Signature Features" (Encyclopedia of Biometrics, Springer). Lee, Berger & Aviczer (1996) is the earlier statistical-features precedent. The canonical set has been refined across many papers but consistently groups into: **time, geometry, direction, pressure, curvature, velocity, acceleration, pen-up structure, Fourier/wavelet descriptors**.

### Features in canonical set AND in chickenScratch (coverage is decent here)

| Canonical feature | ChickenScratch equivalent |
|---|---|
| Total signature duration | `drawingDurationTotal` |
| Pen-down time ratio | `contactTimeRatio` / `pauseTimeRatio` |
| Avg pressure / std / max / min | `avgPressure` / `pressureStd` / `maxPressure` / `minPressure` |
| Number of direction changes | `directionChanges` |
| Curvature statistics | `curvatureAnalysis` |
| Smoothness / jerk | `smoothnessIndex` / `tremorIndex` |
| Stroke count / complexity | `strokeComplexity` |

### High-value canonical features that chickenScratch is **MISSING**

These are the ones to prioritize adding. The literature repeatedly shows these among the top-ranked by Fisher-ratio or mRMR feature selection (Richiardi & Ketabdar 2005, "Local and global feature selection for on-line signature verification"):

1. **Signature width, height, aspect ratio, bounding-box area** — geometry normalization anchors; missing entirely.
2. **Number of pen-ups / pen-downs (N(pen-ups))** — top-5 discriminator in nearly every feature-selection study. Not present.
3. **Average velocity (v_avg)**, **max velocity**, **velocity std**, **velocity at pen-down**, **velocity at first stroke** — velocity is the single most replicated discriminative feature in online signature work (Nelson & Kishon 1991 onward). ChickenScratch derives speed indirectly (`speedAnomalyScore`) but not as a first-class feature.
4. **Average acceleration, max acceleration** — acceleration profiles are harder to forge than velocity, because forgers tend to draw slowly and deliberately. None present.
5. **Azimuth and altitude (pen tilt)** — if the capture device provides them (Wacom, Apple Pencil do; plain touch does not). Missing. Drop this as a dependency if the capture hardware doesn't expose it.
6. **Direction histograms over N bins (typically 8 or 16)** — Plamondon & Lorette 1989; Jain et al. 2002. Compresses trajectory direction into a fixed-length feature vector. Missing.
7. **Centroid of x, centroid of y; first and last pen-down position** — layout features. Missing.
8. **Proportion of time the pen is moving leftward / rightward / upward / downward** — direction-time-share features. Missing.
9. **Horizontal and vertical Fourier descriptors / wavelet energies** — Kholmatov & Yanikoglu 2005. Missing; probably overkill for v1.
10. **Critical points count** (local velocity minima) — used in template-free DSV, e.g., Parziale et al. Missing.
11. **Sigma-lognormal stroke count / log-lognormal parameter stability** — from Plamondon's kinematic theory of rapid human movements. Academic gold standard for characterizing individual motor-control signatures, but heavyweight to implement. **Not worth adding in v1.**

### ChickenScratch features that are **NOT in the standard set** (novel or vestigial)

| Feature | Assessment |
|---|---|
| `pressureBuildupRate`, `pressureReleaseRate` | Plausibly novel, probably useful — analogous to velocity-at-pen-down from the canonical set. **Keep.** |
| `rhythmConsistency`, `tempoVariation` | Reasonable variants of pause/duration statistics. **Keep.** |
| `dwellTimePatterns`, `interStrokeTiming` | Canonical papers use "pen-up duration" statistics. Partially overlapping, mostly novel. **Keep.** |
| `spatialEfficiency`, `strokeOverlapRatio` | Unusual, semantically plausible. **Keep but tag as experimental — these are the ones to validate on a benchmark dataset.** |
| `behavioralAuthenticityScore`, `timingRegularityScore`, `speedAnomalyScore` | These are **meta-scores derived from other features**, not raw features. Inside a feature vector, they are near-redundant with the raw timing features and will inflate the weight of timing in a way that's hard to reason about. **Consider demoting them to a separate "anomaly" post-score** rather than including in the 4-bucket average. |

**Bottom line:** chickenScratch covers ~40-50% of what the literature treats as first-tier global features, and ~0% of the functional (time-series) features. The functional gap dwarfs the global gap.

---

## 3. Matching Algorithm Gap Analysis

### Why per-feature averaging is weaker than DTW

Per-feature averaging over scalar summaries is effectively **treating the signature as a bag of statistics**. It answers the question "are these two signatures similar on average?" But forgers are very good at matching averages. What they cannot match is the **temporal sequence and local kinematics** — how pressure rises and falls across a specific curve, how velocity dips at a specific pen-down event, how the acceleration profile shapes a particular loop.

**Concrete example.** Imagine a genuine signature with rhythm pattern `[fast, pause, slow, fast, pause, slow]` totaling 2.0s, and a skilled forgery with rhythm pattern `[slow, slow, fast, fast, pause, pause]` also totaling 2.0s. Per-feature averaging sees: same `drawingDurationTotal`, same `avgStrokeDuration`, same `pauseTimeRatio`, similar `tempoVariation`. Similarity = 0.95+. DTW, aligning the two velocity time series point-by-point with a warping constraint, reports a huge alignment cost because the sequence structure differs completely. Similarity = 0.2–0.4.

### Expected EER delta (order-of-magnitude)

- **Best global-features-only DSV systems** (no DTW, Mahalanobis-distance on top-40 selected features, trained properly with feature selection): typically published EER in the **5–9% range on skilled forgeries** (Fierrez-Aguilar 2005; Richiardi & Ketabdar 2005; Martinez-Diaz & Fierrez mobile verification work). ChickenScratch's current matching is weaker than the research baseline (no feature selection, no Mahalanobis scaling, no user-specific variance) — realistic EER is probably **8–15%+ on skilled forgeries**, though this is just an informed guess given no benchmark numbers exist.
- **DTW-only on (x, y, pressure)** on MCYT-100 / SVC-2004: published EER typically **3–6% on skilled forgeries, <1% on random forgeries** (enhanced-DTW variants; Kholmatov & Yanikoglu 2005; Fang et al.).
- **DTW + global features fusion** (sum rule at score level): consistently **1–3% better** than either alone (Fierrez-Aguilar 2005; BioSecure BSEC'2009 campaign results).
- **Deep learning (TA-RNN, DsDTW, TS-GATR, HoLoSig on DeepSignDB)**: SOTA is **1.45–2.0% EER on skilled forgeries**, 4vs1 protocol (Tolosana et al.). Requires training data and ML infrastructure.

**Realistic order-of-magnitude gain from bolting on DTW:** 3–5 absolute EER percentage points, moving from "probably mid-teens" to "mid single digits" on skilled-forgery benchmarks.

### Hybrid approach realistic to bolt on without ML?

**Yes, and this is the #1 recommendation.** Pseudocode:

```
dtwScore = DTW_similarity(stored_xyp_series, attempt_xyp_series)  // multivariate DTW
featureScore = existing_chickenScratch_score                       // already exists
finalSignatureScore = 0.6 * dtwScore + 0.4 * featureScore
```

This is **~300 lines of TypeScript**, no model training, no GPU, no training data needed. Normalize the two component scores to 0–100 first (DTW distance → similarity via a per-user distance distribution observed at enrollment). The sum rule for score-level fusion is the most robust and is what Fierrez-Aguilar's paper showed outperforms max rule.

---

## 4. Benchmark Strategy

For a pilot story, running against **SVC-2004 Task 2** and **MCYT-100** gives the strongest rhetorical position:

| Dataset | Users | Genuine × Forgery | What it buys you | SOTA EER (skilled) |
|---|---|---|---|---|
| **SVC-2004 Task 2** | 100 | 20 × 20 | Oldest, most-cited. "We ran against the canonical benchmark." Task 2 includes pressure + tilt. | Best team at the 2004 competition: **2.89%**. Modern systems: ~1–2%. |
| **MCYT-100** | 100 | 25 × 25 | Second-most-cited. Spanish research standard. | Published DTW EERs ~2–5% skilled; best modern DL <1%. |
| **SUSIG-Visual / SUSIG-Blind** | 100 | ~20 × 10 | Has both visual-tablet (sees ink) and blind (no ink) protocols. Useful for mobile-style capture. | 2–4% skilled with DTW. |
| **BiosecurID-SONOF** | 400 | 16 × 12 | Large user count, strong population diversity. | Used as a component of DeepSignDB. |
| **DeepSignDB** | 1,526 | many per user, stylus + finger | Newest, largest, mobile and stylus. **Best for a 2026-era startup.** | TA-RNN: 1.5% / HoLoSig: 1.73% (4vs1 skilled) / TS-GATR: 1.45%. |
| **SVC-onGoing (CodaLab, ongoing)** | — | — | Public live leaderboard. Lets you submit and get a ranked result. | Best-in-competition: 3.33% / 7.41% / 6.04% across three tasks. |

**Recommended credible pilot claim:** *"ChickenScratch achieves X% EER on SVC-2004 Task 2 (skilled forgery) with a single-template-per-user protocol, matching/trailing the [2004 competition winner / published DTW baseline of ~3%] without any ML infrastructure."* Pick a claim calibrated to actual measured results. Do **not** claim to be SOTA against DeepSignDB — deep-learning systems hit 1.5% EER.

For an honest pilot, aim for **3–5% EER on SVC-2004 Task 2 skilled forgeries** as a "credible and defensible" target; 5–7% is still a respectable story for a non-ML system with a unique multi-modal pitch.

---

## 5. UX / Score Presentation — The "81% Feels Close to Passing" Problem

Industry almost universally **does not show users a similarity percentage**. The 81% problem is a real one, and it's usually solved by refusing to show the score at all.

- **Apple Face ID / Touch ID:** Pass/fail only. No score exposed to the user or to the application. Internally uses a threshold corresponding to a ~1 in 1,000,000 FAR (Face ID) or ~1 in 50,000 (Touch ID). App only receives a LocalAuthentication success/failure boolean.
- **Windows Hello:** Pass/fail. Internal threshold adjusts upward as more users enroll on the device. Never shows a numeric similarity. (Microsoft Learn: "The representation must cross a machine-learned threshold before the algorithm will accept it as a correct match.")
- **DocuSign / Dropbox Sign (formerly HelloSign):** These are **not really doing behavioral DSV**. DocuSign ID Verification uses KBA, ID document OCR, and optionally a selfie with liveness. Dropbox Sign uses SMS + KBA. Neither exposes a signature-similarity score — the signature is treated as legal intent, not as a biometric match. When they do biometric verification, it's pass/fail via a partner (typically Onfido, Jumio, iProov).
- **Scriptel / SigPlus / Topaz (the pen-tablet DSV vendors):** These do expose numeric scores to the enterprise integrator (not end user), usually on a 0–100 scale with a recommended threshold. But the end-user experience is always just "signed / rejected." The score is a developer-facing artifact, not a consumer-facing one.
- **FIDO Alliance biometric certification** (the de facto industry bar for biometric auth components): requires **FAR ≤ 1:50,000 at FRR ≤ 3%** (Level 1) and stricter at Level 2. FIDO also requires IAPAR (presentation attack) testing ≤ 15% (L1) / ≤ 7% (L2).

**Recommendation:** stop showing numeric scores to end users. Expose a binary outcome (authenticated / not authenticated / try again), and optionally a categorical confidence label (like "strong match" / "weak match, please retry"). Retain numeric scores in the **admin/diagnostics dashboard** and in enterprise integrator APIs, but never on the authentication UI itself. The 81% problem evaporates the moment the user sees "verified" or "please try once more" instead of a number. This matches how every serious biometric product in the market works.

For integrator-facing thresholds, target **FAR ≤ 1:10,000 at FRR ≤ 5%** as a pilot-tier claim, and publish a DET curve (not just EER) in your whitepaper. The DET curve is the standard in NIST FRVT and SVC — it shows how you trade FAR against FRR at different operating points.

---

## 6. Ranked Keep / Drop / Replace Table + Prioritized Add List

### ChickenScratch's 26 features, graded

**PRESSURE BUCKET (8)**
| Feature | Verdict | Rationale |
|---|---|---|
| `avgPressure` | **KEEP** | Canonical. Top-tier. |
| `maxPressure` | **KEEP** | Canonical. |
| `minPressure` | **KEEP** | Canonical. |
| `pressureStd` | **KEEP** | Canonical. |
| `pressureRange` | **LOW-VALUE** | Fully redundant with max–min. |
| `contactTimeRatio` | **KEEP** | = pen-down time ratio; canonical top-5. |
| `pressureBuildupRate` | **KEEP** | Good extension; likely useful on skilled forgers. |
| `pressureReleaseRate` | **KEEP** | Same logic. |

**TIMING BUCKET (8)**
| Feature | Verdict | Rationale |
|---|---|---|
| `drawingDurationTotal` | **KEEP** | Canonical. |
| `avgStrokeDuration` | **KEEP** | Canonical. |
| `pauseTimeRatio` | **KEEP** | Canonical. |
| `pauseDetection` | **LOW-VALUE** | Binary; already implicit in `pauseTimeRatio`. |
| `rhythmConsistency` | **KEEP** | Reasonable novel. |
| `tempoVariation` | **KEEP** | Reasonable novel. |
| `dwellTimePatterns` | **KEEP** | Partially overlaps pen-up duration stats. |
| `interStrokeTiming` | **KEEP** | Same. |

**GEOMETRIC BUCKET (7)**
| Feature | Verdict | Rationale |
|---|---|---|
| `strokeComplexity` | **KEEP** | Canonical-adjacent. |
| `tremorIndex` | **KEEP** | Strong forgery signal; forgers often tremor. |
| `smoothnessIndex` | **KEEP** | Canonical (jerk-based). |
| `directionChanges` | **KEEP** | Canonical top-10. |
| `curvatureAnalysis` | **KEEP** | Canonical. |
| `spatialEfficiency` | **REPLACE** | Replace with **bounding-box aspect ratio + width + height + centroid (x, y)**. These are canonical top-20 and test objectively better. |
| `strokeOverlapRatio` | **KEEP** (experimental) | Novel. Validate on benchmark before shipping. |

**SECURITY BUCKET (3)**
| Feature | Verdict | Rationale |
|---|---|---|
| `speedAnomalyScore` | **DROP from feature vector, KEEP as post-hoc flag** | It's a derived score, not a raw feature. Double-counts timing. |
| `timingRegularityScore` | **DROP from feature vector, KEEP as post-hoc flag** | Same. |
| `behavioralAuthenticityScore` | **DROP from feature vector, KEEP as post-hoc flag** | Same. |

### Prioritized ADD list (in order of expected impact)

1. **Multivariate DTW over (x, y, pressure)** — not a feature, a parallel matcher. Fused 0.6/0.4 with the feature score. This is #1 by a large margin.
2. **Velocity features**: v_avg, v_max, v_std, v at first pen-down. (4 features)
3. **Acceleration features**: a_avg, a_max. (2 features)
4. **Number of pen-ups / pen-downs / strokes**. (3 features — partially covered by `strokeComplexity`; make them first-class scalars)
5. **Geometry: bounding-box width, height, aspect ratio, centroid_x, centroid_y.** (5 features) — replace `spatialEfficiency`.
6. **Direction histogram over 8 bins**: fraction of trajectory time spent in each of 8 45°-arc direction bins. (8 features)
7. **Critical-point count**: number of local velocity minima. (1 feature — cheap, discriminative)
8. **Pen-up duration statistics**: mean and std of pen-up durations. (2 features)

That's ~25 new features for a total of ~45 raw features after drops — still in the "global-features DSV" tractable range and well below the canonical 100. Apply **per-user Mahalanobis scaling** (compute mean AND variance across enrollment samples, divide feature difference by that user's std for that feature) rather than raw difference — this alone typically gains 1–2 EER points.

### Enrollment samples: 3 vs. 5 vs. 10

Literature consensus (Fierrez-Aguilar et al., Martinez-Diaz et al., and more recent Krzyzak work): **EER drops sharply from 1 → 5 samples and flattens by 7–8 samples.** Going from 3 → 5 typically yields ~1 absolute EER point improvement; 5 → 10 yields ~0.3–0.5 points. ChickenScratch's 3 is defensible for a consumer-UX pilot (lower enrollment friction = higher funnel completion) but noticeably sacrifices accuracy. Consider **5 as the default, with 3 as an "express enrollment" option**, matching the trade-off that DeepSign papers call "failure-to-enroll managing."

---

## 7. Concrete Next-3-Steps for Pilot Readiness

### Step 1 (highest leverage, ~1–2 weeks of work): Bolt on multivariate DTW
- Implement DTW over the (x, y, pressure, velocity) time series stored at enrollment. Use Sakoe-Chiba band constraint with width = 10% of series length.
- Fuse with existing feature score at 0.6 DTW / 0.4 feature via sum rule on normalized 0–100 scales.
- Gate on DTW ≥ 70 AND feature ≥ 70 AND fused ≥ 80.
- Expected impact: **3–5 absolute EER points improvement**. This is the single biggest credibility gain available without ML.

### Step 2 (~1 week): Run against SVC-2004 Task 2 and MCYT-100
- SVC-2004: https://cse.hkust.edu.hk/svc2004/. MCYT: request from ATVS at UAM.
- Publish a DET curve and report EER at 1:10,000 FAR. This is the **single most important pilot-readiness artifact** — it turns chickenScratch from "a thing someone built" into "a thing benchmarked against the industry standard." You can't get a serious enterprise pilot without this, and you can get a pilot *with* almost any honest number on it.
- Submit to SVC-onGoing on CodaLab. Even placing outside the top 10 gets you a defensible public leaderboard position.

### Step 3 (~1 week): Fix the score UI and the feature set cleanup in parallel
- Stop showing the numeric similarity on the authentication screen. Show "verified" / "please try again" (binary).
- Drop the three `*Score` "security" meta-features from the feature vector (keep them as diagnostic flags in admin).
- Replace `spatialEfficiency` with width/height/aspect-ratio/centroid. Add the velocity and acceleration features and N(pen-ups), N(pen-downs), and the 8-bin direction histogram.
- Add per-user Mahalanobis scaling at enrollment (store per-feature variance across the 3 samples, divide feature-distance by that variance in the matcher).
- Consider moving default enrollment from 3 → 5 samples (with 3 available as a "quick enroll" option).

**If resources allow a Step 4:** lean into the shapes/drawings angle as a novelty-claim in the pilot whitepaper. Published multi-modal behavioral fusion combines signature with face/voice/keystroke, not with calibration shapes captured in the same session. You have a legitimately unexplored combination — frame it as "static-instruction multi-prompt behavioral biometrics" and cite the lack of prior art. The shape scores are weaker authenticators individually (drawings are less unique than signatures), but as **independent corroborating signals** fused at score level they contribute real information, especially against replay and device-spoofing attacks.

---

## Key References

- Fierrez-Aguilar, Krawczyk, Ortega-Garcia, Bigun — "An On-Line Signature Verification System Based on Fusion of Local and Global Information" (ICB 2005) — canonical global feature set, Mahalanobis scoring, sum-rule fusion.
- Tolosana, Vera-Rodriguez, Fierrez, Ortega-Garcia — "DeepSign: Deep On-Line Signature Verification" (IEEE TBIOM 2021) — DeepSignDB database, TA-RNN 1.5% EER. https://arxiv.org/abs/2002.10119
- Tolosana et al. — "SVC-onGoing: Signature Verification Competition" (Pattern Recognition 2022) — best competition EERs 3.33 / 7.41 / 6.04%. https://arxiv.org/pdf/2108.06090
- Yeung et al. — "SVC2004: First International Signature Verification Competition" — Task 2 skilled forgery best-team 2.89% EER. https://cse.hkust.edu.hk/svc2004/
- Richiardi & Ketabdar — "Local and global feature selection for on-line signature verification" (ICDAR 2005) — Fisher ratio, feature ranking.
- Ortega-Garcia et al. — MCYT baseline corpus (100-user Spanish dataset).
- Kholmatov & Yanikoglu — "SUSIG: an on-line signature database, associated protocols and benchmark results" (Pattern Analysis and Applications).
- Plamondon & Djioua — "A Sigma-Lognormal representation for on-line signatures" (Pattern Recognition 2009) — kinematic theory of rapid human movements.
- FIDO Alliance — "Biometric Requirements v4.0" — industry FAR ≤ 1:50,000 @ FRR ≤ 3% thresholds. https://fidoalliance.org/specs/biometric/requirements/Biometrics-Requirements-v4.0-fd-20240522.pdf
- Microsoft — "Windows Hello face authentication" — pass/fail UX, no score exposed.
- DocuSign — "The Integration of Biometric Authentication in E-Signatures" — ID Verification architecture (KBA + liveness, not behavioral DSV).
