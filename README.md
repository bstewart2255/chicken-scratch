# chickenScratch

Biometric authentication using handwriting — signature + shape drawings.

## Structure

```
packages/
  backend/   — Express API server (Node.js + TypeScript)
  frontend/  — React diagnostic UI (Vite)
  sdk/       — Drop-in JavaScript SDK for customers
  shared/    — Shared types, validation, constants
```

## Quick Start

```bash
npm install
npm run dev        # starts backend (port 3003) + frontend (port 5173)
```

## Environment

Copy `.env.example` to `.env` in `packages/backend/` and fill in:
- `ENCRYPTION_KEY` — 64 hex chars (AES-256-GCM key for biometric data)
- `DATABASE_URL` — Postgres connection string (when deployed)
