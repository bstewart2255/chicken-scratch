# chickenScratch — Quick Start Guide

Biometric signature authentication for your app. Users sign their name, draw shapes, and chickenScratch verifies their identity based on how they draw — not just what they draw.

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

## 4. Enrollment (First Time)

Enrollment collects 3 signature samples + 5 shape drawings to build a biometric baseline.

```js
// Run the enrollment flow — renders a multi-step UI in the container
const result = await cs.enroll('user-123');

if (result.enrolled) {
  // User is now enrolled. Store this fact in your app.
  console.log('Enrollment complete');
}
```

The SDK handles:
- Consent collection (BIPA/GDPR compliant)
- 3 signature captures
- 5 shape/drawing captures (circle, square, triangle, house, smiley)
- Progress indicator
- Retry on errors

## 5. Verification (Returning User)

Verification captures 1 signature + shapes in a randomized challenge order, then returns pass/fail.

```js
const result = await cs.verify('user-123');

if (result.authenticated) {
  // Grant access
} else {
  // Deny access — user can retry
}
```

The server never exposes scores or thresholds to the client. You only get `authenticated: true/false`.

## 6. Check Enrollment Status

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
