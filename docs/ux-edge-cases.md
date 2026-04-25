# UX Edge Cases — End-User Verify Flow

Working document. Catalogs every edge case an end-user might hit while authenticating with chickenScratch. Each item is tagged with the system's current handling:

- `[ok]` — handled cleanly today
- `[partial]` — system surfaces *something* but UX/copy/affordance needs work
- `[gap]` — no specific UX today

Use this list as a backlog for SDK UX work and customer-integration guidance. Knock items off as they ship; add new ones as they surface from real-user testing.

Ground truth file references inline (paths are repo-relative).

---

## 1. Before drawing — entry points

- **No enrollment for this user** → `USER_NOT_FOUND`. `[partial]` Customer must route to enroll flow; SDK has no built-in handoff.
- **Partial enrollment** (signature only, missing a shape) → server returns "No baseline found for 'circle' on desktop" ([auth.service.ts:200](../packages/backend/src/services/auth.service.ts#L200)). `[gap]` Message is technical.
- **Enrolled on mobile, opening verify on desktop** (or reverse) → `DEVICE_CLASS_MISMATCH` with `enrolledClasses` list ([auth.service.ts:167](../packages/backend/src/services/auth.service.ts#L167)). `[partial]` Code is structured; UX of "switch to your phone" is on the customer.
- **Consent previously withdrawn** → enroll blocks, but verify does *not* re-check ([consent.service.ts:159](../packages/backend/src/services/consent.service.ts#L159) called from enroll routes only). `[gap]` Withdrawn-but-still-verifying is an inconsistent state.
- **Returning user re-shown the consent panel** every verify? `[partial]` Verify; could feel like nagging.

## 2. Drawing input

- **Accidental tap (single dot, < 20 points)** — rejected at enroll, *accepted at verify* ([enrollment.service.ts:217](../packages/backend/src/services/enrollment.service.ts#L217); no equivalent in `auth.service.ts`). `[gap]` Verify silently scores garbage.
- **Stroke too small / off-canvas** (< 30 px bbox) — same enroll-only asymmetry. `[gap]`
- **Stroke too fast (< 200 ms)** — same enroll-only asymmetry. `[gap]`
- **Multi-stroke signature with long pen-up gap** — does the canvas treat it as one signature or commit early? `[partial]` Confirm.
- **Palm rejection on tablets** — palm strokes captured alongside finger. `[gap]`
- **Touch interrupted** by phone call / notification / app switch mid-stroke — partial stroke submitted. `[gap]` No "resume" or "redo" affordance.
- **Screen rotation mid-flow** — canvas resizes, in-progress stroke lost? `[gap]`
- **Printed name vs cursive vs scribble** — depends entirely on what was enrolled; mismatch = silent fail. `[gap]`
- **Stroke clipped at canvas border** `[gap]`
- **Two-finger zoom or scroll on canvas** triggering unwanted strokes `[gap]`
- **Stylus battery dies between strokes** — switches to finger mid-flow; pressure profile changes. `[gap]`

## 3. Shape phase

- **User can't remember which shapes were enrolled** — server picks order, SDK shows label. `[ok]` if labels are clear.
- **Shape order changes each verify (liveness feature)** — could feel buggy. `[partial]` Needs UX copy: "We ask in random order on purpose."
- **User draws a heart that "looks fine" but scores 60** — heart has σ 8.55 in genuine baseline (per [scoring-tuning-log.md](./scoring-tuning-log.md)). Some genuine attempts naturally land in the 60s. `[partial]` Current copy just says "failed."
- **Shape-set changed since enrollment** (e.g. triangle→heart swap) — legacy enrollment has no heart baseline. `[gap]` Re-enrollment prompt? Migration?
- **Right shape, wrong sequence relative to challenge** — sequence validation rejects ([session.service.ts:114](../packages/backend/src/services/session.service.ts#L114)). `[ok]` server-side. UX message? `[partial]`

## 4. Session & network

- **Challenge expires mid-flow (5-min TTL)** — SDK polling returns `Mobile verify session expired...` with no error code ([chicken-scratch.ts:303](../packages/sdk/src/chicken-scratch.ts#L303)). `[partial]` Needs "your session timed out, start over" copy.
- **Device idle on canvas screen for 6+ min before submit** → submission rejected for stale timestamp ("Submission data is too old", [auth.service.ts:147](../packages/backend/src/services/auth.service.ts#L147)). `[gap]` No countdown, no warning.
- **Network drop during submission** — SDK shows `loading` state indefinitely? `[gap]` Needs a timeout + retry affordance.
- **Page refresh mid-flow** — strokes lost, challenge orphaned. `[gap]`
- **Two tabs open simultaneously** racing for the same challenge. `[gap]`
- **Browser back button mid-flow.** `[gap]`
- **Mobile QR handoff (enroll on phone, verify on laptop)** — laptop polls; phone disconnects WiFi → laptop eventually shows "expired." `[partial]`
- **SDK token expires (15 min)** while user is still drawing. `[gap]`

## 5. Outcome — failure

- **Failed verify, no reason given** — by design (no score leakage, [tenant-api.routes.ts:442](../packages/backend/src/routes/tenant-api.routes.ts#L442)). `[partial]` Privacy-correct but actionability suffers. Need generic "try again, draw more like your usual" copy.
- **Lockout after 5 fails (423, `retryAfterSeconds`)** ([tenant-api.routes.ts:379](../packages/backend/src/routes/tenant-api.routes.ts#L379)). `[partial]` Needs clock UI: "Try again in 14:32." Currently just an error.
- **Rate-limited (429)** — distinct from lockout but feels the same to user. `[partial]`
- **5xx from server** — generic browser error? `[gap]`
- **Customer's API key expired / rotated** — user sees an unrelated-feeling error. `[gap]`
- **Attestation mismatch** (`INVALID_ATTESTATION`, `ATTESTATION_TENANT_MISMATCH`) — almost always an integration bug, but surfaces to the user. `[gap]`

## 6. Outcome — false rejects (genuine user, real friction)

- **Signature genuinely changed** — broken hand, kid hand grew, aging, illness. `[gap]` No re-enrollment trigger, no drift detection.
- **Cold hands, less pressure** — pressure features differ from baseline. `[gap]`
- **Tired / drunk / sick** — natural higher variance. `[gap]`
- **Drawing in public, rushing or hiding screen** — speed and care change. `[gap]`
- **Pregnancy, medication, age** — slow drift over weeks/months. `[gap]`
- **Hand tremor (Parkinson's, anxiety)** — high-frequency patterns differ from baseline. `[gap]`
- **Different finger / opposite hand than enrolled.** `[gap]`
- **Stylus user verifying with finger** (or reverse) — input method differs; client-controlled, no rejection. `[gap]`

## 7. Recovery & retry paths

- **After fail #1** — SDK shows result, then what? `[gap]` "Try again" button vs. fall through to fallback?
- **After fail #5 (lockout)** — countdown UI? Customer's fallback (SMS, password) clearly offered? `[gap]`
- **Start-over mid-flow** — clear/redo button on canvas. `[partial]` Confirm.
- **Switch devices mid-flow** ("let me try on my phone"). `[gap]`
- **"I forgot which signature I enrolled with"** — no recovery UX. `[gap]`
- **Re-enrollment after lockout clears** — is it offered, or does the user live with their old baseline forever? `[gap]`

## 8. Accessibility

- **Screen reader / VoiceOver user** — canvas is invisible to assistive tech. `[gap]`
- **One-handed user** — canvas size assumes two-handed use? `[gap]`
- **Low vision** — canvas too small / contrast too low. `[gap]`
- **Motor impairment** — hand tremor, limited range, neuropathy. Behavioral biometrics may inherently exclude. `[gap]` Needs documented alternative auth path (P2 in pilot checklist).
- **Cognitive impairment** — forgets shapes, forgets process. `[gap]`
- **Color-blind users** — pass/fail icon color cues. `[partial]`
- **Reduced-motion preference** — completion animations? `[partial]`
- **Browser zoom non-100%** — canvas coordinate handling. `[gap]`
- **Dark mode** — canvas + ink visibility. `[partial]`

## 9. Cognitive / first-time experience

- **User expects a password field, sees a canvas.** `[gap]` Needs onboarding copy.
- **"Draw your signature" — what counts?** Cursive? Printed? Initials? Scribble? `[gap]`
- **User self-conscious about messy signature.** `[gap]`
- **Doesn't realize each shape is part of auth** (thinks shapes are decorative). `[gap]`
- **First-time vs returning user on same device** — different copy / progressive disclosure. `[gap]`

## 10. Privacy / consent flow

- **Privacy-policy link clicked mid-draw** — opens new tab; in-progress strokes preserved? `[gap]`
- **Consent withdrawn mid-flow** — verify still succeeds, enroll doesn't. `[gap]` Inconsistent.
- **Account deleted between challenge and verify** — likely 404, generic message. `[gap]`
- **"Delete my data" entry point on the result screen** — none. `[gap]`

## 11. Multi-device / recovery scenarios

- **Lost phone (only enrolled device)** — falls to customer's fallback. `[gap]`
- **Phone in for repair, swapped to loaner** — different fingerprint, different input feel. `[gap]`
- **New phone (kept old account)** — must re-enroll? Flow not specified. `[gap]`
- **Travel with bad network** — verify request times out partway. `[gap]`

---

## Top 6 to address before pilot

If forced to pick:

1. **Quality gate at verify** — silent low scores instead of "your stroke didn't register, please try again." Cheap fix; mirror the enroll-side `validateSignatureQuality` call into `verifyFull`.
2. **Lockout countdown UI** — users hit 423 with no clue when they can retry. `retryAfterSeconds` is already in the response payload.
3. **Challenge-expiration warning** — visible "session expires in N seconds" indicator before TTL hits.
4. **Re-enrollment story** — when a genuine user's signature has drifted, there must be a trigger. At minimum: "you've failed 3× in a row, want to re-enroll?" affordance.
5. **Recovery copy after fail** — "try again" vs "use fallback" decision tree. Customer-side decision, but ship a recommended pattern in [QUICK_START.md](../QUICK_START.md).
6. **Cross-device handoff guidance** — enroll on phone / verify on desktop is the real-world flow; SDK currently doesn't guide it.

---

## How to use this doc

- Tag transitions: `[gap]` → `[partial]` → `[ok]` as work lands. Append commit hash where useful.
- Add new edge cases at the bottom of the relevant section as user testing or support tickets surface them.
- Sibling docs: [security-overview.md](./security-overview.md) (security working set), [scoring-tuning-log.md](./scoring-tuning-log.md) (empirical scoring changes).
