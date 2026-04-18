# chickenScratch — Quick Start Guide

Biometric account recovery for your app. Users enroll their signature once at signup. When they forget their password — or which email they used — they sign to recover their account. No email reset links. No SMS codes. Phishing-proof, AI-resistant, drop-in SDK.

The same primitive also works for step-up auth on sensitive actions (wire transfers, settings changes, etc.). This guide covers recovery as the primary use case.

## 1. Get Your API Key

Your chickenScratch admin will create a tenant for your organization and provide you with:

- **API Key** — starts with `cs_live_` (used to authenticate all API calls)
- **Base URL** — `https://chicken-scratch-production.up.railway.app`

## 2. Add the SDK

### Option A: Script Tag (simplest)

```html
<script src="https://chicken-scratch-production.up.railway.app/sdk/dist/chicken-scratch.js"></script>
```

### Option B: npm

```bash
npm install @chicken-scratch/sdk
```

```js
import { ChickenScratch } from '@chicken-scratch/sdk';
```

## 3. Get an SDK Token (Recommended)

Your **backend server** requests a short-lived SDK token for each user session. This keeps your API key on your server — never exposed in the browser.

```js
// YOUR BACKEND (Node.js example)
app.get('/api/auth-token', async (req, res) => {
  const userId = req.user.id; // your authenticated user

  const response = await fetch('https://chicken-scratch-production.up.railway.app/api/v1/sdk-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'cs_live_your_api_key', // stored in env, never sent to browser
    },
    body: JSON.stringify({ externalUserId: userId }),
  });

  const { token } = await response.json();
  res.json({ token }); // send the short-lived token to your frontend
});
```

## 4. Embed the Widget

Your **frontend** fetches the token from your backend, then initializes the SDK:

```html
<div id="auth-container" style="width: 500px; height: 600px;"></div>

<script>
// Fetch a short-lived token from your backend
const { token } = await fetch('/api/auth-token').then(r => r.json());

const cs = new ChickenScratch({
  apiKey: token,  // cs_sdk_... token (expires in 15 min)
  baseUrl: 'https://chicken-scratch-production.up.railway.app',
  container: '#auth-container',
  onComplete: (result) => {
    if (result.enrolled) {
      console.log('User enrolled successfully!');
    }
    if (result.authenticated) {
      console.log('User verified!');
    }
  },
  onError: (error) => {
    console.error('Auth error:', error.message);
    // If token expired, fetch a new one and reinitialize
  }
});
</script>
```

> **Quick testing:** For development/testing, you can pass your API key (`cs_live_...`) directly instead of an SDK token. Don't do this in production — the key would be visible to anyone viewing your page source.

## 4. Enrollment (at signup)

Enrollment collects 3 signature samples + 5 shape drawings to build a biometric baseline. Run it once, right after the user completes your normal signup.

```js
// Run the enrollment flow — renders a multi-step UI in the container
const result = await cs.enroll('user-123');

if (result.enrolled) {
  // User is now enrolled. Store this fact in your app.
  console.log('Recovery is now set up for this user');
}
```

The SDK handles:
- Consent collection (BIPA/GDPR compliant)
- 3 signature captures
- 5 shape/drawing captures (circle, square, triangle, house, smiley)
- Progress indicator
- Retry on errors

**Frame it right.** Users see enrollment as "setting up Sign Recovery so you don't get locked out later" — a feature, not a security chore. This drives adoption way higher than "please add this biometric auth step."

## 5. Recovery (when the user gets locked out)

Call this from your "forgot password" flow. Captures 1 signature + shapes in a randomized challenge order, then returns pass/fail.

```js
const result = await cs.verify('user-123');

if (result.authenticated) {
  // Proven it's really them — log them in, or let them set a new password inline
} else if (result.errorCode === 'DEVICE_CLASS_MISMATCH') {
  // User is on a device type they haven't enrolled. Show them which ones
  // they have:
  console.log('Enrolled on:', result.enrolledClasses); // e.g. ['mobile']
  // Prompt them to switch devices, or to add this device via another enrollment.
} else {
  // Signature didn't match the baseline — let them retry, then fall back to
  // email reset if they can't pass.
}
```

The server never exposes scores or thresholds to the client — you only get `authenticated: true/false` plus optional error codes. Same primitive works for step-up auth on sensitive actions.

## 6. Adding another device (optional)

Signatures drawn with a finger on a phone produce a different biometric signal than with a mouse on a laptop. chickenScratch supports per-class baselines (`mobile` and `desktop`) — a user can enroll both and recover from either.

To add a new device class for a user who's already enrolled on one:
1. User signs in on their existing device and successfully verifies (e.g. via a regular recovery flow, or a login-time biometric check).
2. Within 10 minutes, they call `cs.enroll('user-123')` on the new device class.
3. Baseline for the new class is created. They can now recover from either device.

The 10-minute recent-verify requirement is what makes "add a device" safe — an attacker with a stolen SDK token can't add their own device without first biometrically verifying as the user.

If your app already authenticates the user via other means (password + MFA), you can bypass the gate by passing `skipRecentVerify: true` on the enrollment call from your backend. You then take responsibility for that authentication step.

## 7. Check Enrollment Status

```js
const enrolled = await cs.isEnrolled('user-123');
```

## API Reference

If you prefer to build your own UI instead of using the SDK, here are the raw API endpoints.

All requests require the `X-API-Key` header (or `Authorization: Bearer` header) with your API key.

### Consent (required before enrollment)

```bash
# Record consent
curl -X POST https://chicken-scratch-production.up.railway.app/api/v1/consent \
  -H "X-API-Key: cs_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId": "user-123"}'

# Check consent status
curl https://chicken-scratch-production.up.railway.app/api/v1/consent/user-123 \
  -H "X-API-Key: cs_live_your_key"
```

### Enrollment

```bash
# Submit a signature sample (repeat 3 times)
curl -X POST https://chicken-scratch-production.up.railway.app/api/v1/enroll \
  -H "X-API-Key: cs_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId": "user-123", "signatureData": { ... }}'

# Submit a shape sample
curl -X POST https://chicken-scratch-production.up.railway.app/api/v1/enroll/shape \
  -H "X-API-Key: cs_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId": "user-123", "shapeType": "circle", "signatureData": { ... }}'

# Check enrollment status
curl https://chicken-scratch-production.up.railway.app/api/v1/enroll/user-123/status \
  -H "X-API-Key: cs_live_your_key"
```

### Verification

```bash
# Get a challenge (returns randomized shape order)
curl -X POST https://chicken-scratch-production.up.railway.app/api/v1/challenge \
  -H "X-API-Key: cs_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId": "user-123"}'

# Submit verification (signature + shapes in challenge order)
curl -X POST https://chicken-scratch-production.up.railway.app/api/v1/verify \
  -H "X-API-Key: cs_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "externalUserId": "user-123",
    "signatureData": { ... },
    "shapes": [{"shapeType": "triangle", "signatureData": { ... }}, ...],
    "challengeId": "from-challenge-response"
  }'
```

### User Deletion (GDPR/BIPA right to erasure)

```bash
curl -X DELETE https://chicken-scratch-production.up.railway.app/api/v1/users/user-123 \
  -H "X-API-Key: cs_live_your_key"
```

## Interactive API Docs

Full OpenAPI documentation with try-it-out is available at:

**https://chicken-scratch-production.up.railway.app/docs**

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Enrollment | 30 requests / minute per tenant |
| Verification | 60 requests / minute per tenant |

After 5 consecutive failed verifications, the user is locked out for 30 minutes.

## Security

- API keys are hashed (SHA-256) — we never store your raw key
- Biometric scores and thresholds are never exposed to clients
- Challenge ordering is randomized per verification to prevent replay
- Stroke data timestamps are validated to prevent pre-recorded submissions
- Device fingerprinting detects device changes between enrollment and verification
- Consent is collected and tracked for BIPA/GDPR compliance
