# @chicken-scratch/demo-app

A reference customer integration of chickenScratch — a deliberately-mundane fake B2B portal ("BenefitsDesk") with biometric account recovery wired in via the SDK. Use it as:

1. **A sales/demo artifact** — "here's what it looks like integrated into a real app."
2. **A reference implementation** — customers can clone/copy this as a starting point.
3. **An end-to-end test harness** — exercises the real tenant API path (SDK token issuance, cross-origin fetch, error-code handling) that the landing-page demo skips.

## Architecture

```
packages/demo-app/
├── client/          # React + Vite frontend
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── api.ts   # calls /demo-api/* on our own backend
│       └── pages/   # Home, Signup, Login, Forgot, Dashboard
└── server/          # Express backend
    ├── index.ts     # HTTP server + /demo-api/* routes + serves built client
    ├── auth.ts      # in-memory fake user store (NOT production-safe)
    └── ...
```

The demo-app backend is what a real customer's backend would be: it holds the chickenScratch API key, issues short-lived SDK tokens to the browser, and handles its own (fake) authentication. The demo-app frontend is what a real customer's frontend would be: it embeds the `@chicken-scratch/sdk` widget using those SDK tokens.

## Flows exercised

- **Signup → enrollment prompt → enrollment** — mirrors how a customer would call `cs.enroll()` right after a new user completes their normal signup.
- **Login** — normal email/password path (nothing biometric).
- **Forgot password** — the point of the demo: email-fragment lookup → pick account → SDK `cs.verify()` → if pass, set new password (optional) and log in.
- **DEVICE_CLASS_MISMATCH handling** — if the user enrolled on mobile and tries to recover on desktop (or vice versa), we render a "wrong device type" screen with instructions.

## Local development

You need three processes running:
1. The main chickenScratch backend (in `packages/backend`) on port 3003.
2. The demo-app's backend on port 3004.
3. The demo-app's frontend dev server on port 5174.

```bash
# From repo root — first time:
npm install

# Start the main backend (separate terminal)
npm run dev -w packages/backend

# Start both demo-app processes (another terminal)
npm run dev -w packages/demo-app
```

Then open http://localhost:5174.

### Environment variables (demo-app backend)

Set these in `packages/demo-app/.env` or export them in your shell:

| Var                       | Default                                                 | Purpose |
|---------------------------|---------------------------------------------------------|---------|
| `PORT`                    | `3004`                                                  | HTTP port for the demo-app backend |
| `CHICKEN_SCRATCH_BASE_URL`| `https://chickenscratch.io`     | Where to call for SDK token issuance and where the browser SDK talks |
| `CHICKEN_SCRATCH_API_KEY` | *(none)*                                                | Your tenant API key (starts `cs_live_`). Required for SDK token issuance. Get one from the admin dashboard. |

For local dev, point `CHICKEN_SCRATCH_BASE_URL` at `http://localhost:3003` to talk to your local backend instead of production.

## Deploying as a second Railway service

The demo-app is designed to deploy as a separate Railway service alongside the main `chicken-scratch` service, sharing the same GitHub repo.

**Setup (one-time):**

1. In the Railway dashboard, open the chicken-scratch project.
2. Click **New → GitHub Repo** and point it at `bstewart2255/chicken-scratch` again (same repo, new service).
3. In the new service's Settings:
   - **Start Command:** `npm run start -w packages/demo-app`
   - **Build Command:** `npm install && npm run build -w packages/shared && npm run build -w packages/sdk && npm run build -w packages/demo-app`
4. In the new service's Variables:
   - `CHICKEN_SCRATCH_BASE_URL` — URL of the main chickenScratch backend (e.g. `https://chickenscratch.io`)
   - `CHICKEN_SCRATCH_API_KEY` — an API key generated via the admin dashboard of the main service
5. Optional: attach a custom domain (e.g. `demo.chicken-scratch.app`). Otherwise Railway auto-assigns `*.up.railway.app`.

**Also update the main backend's `ALLOWED_ORIGINS`** (on the main chicken-scratch Railway service) to include the demo-app's origin. The browser SDK calls the main backend directly, so the main backend's CORS must allow the demo-app's origin.

## Deliberate non-features

These are absent on purpose — this is a demo, not a production app:

- **Password hashing.** Stored plaintext in memory. Don't put real passwords here.
- **Persistent storage.** Every server restart wipes the user list.
- **Email verification.**
- **Real session tokens.** Just random hex, no JWT, no expiry.
- **Consent UI on our side.** The SDK handles consent collection itself.
- **Add-device flow on a settings page.** Follow-up work — the SDK supports it (via the recent-verify gate), we just don't have a page for it yet.

## Contributing / customizing

Treat this as reference code — fork the package, rename, swap out the fake auth for your real one, keep the SDK integration. The three files you'd likely change:

- `server/index.ts` — replace the fake `/demo-api/*` routes with calls into your existing auth.
- `client/src/pages/Signup.tsx` — splice `cs.enroll()` into your existing post-signup flow.
- `client/src/pages/Forgot.tsx` — splice `cs.verify()` into your existing "forgot password" flow.
