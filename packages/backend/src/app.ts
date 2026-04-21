import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import * as Sentry from '@sentry/node';
import healthRoutes from './routes/health.routes.js';
import enrollmentRoutes from './routes/enrollment.routes.js';
import authRoutes from './routes/auth.routes.js';
import sessionRoutes from './routes/session.routes.js';
import diagnosticsRoutes from './routes/diagnostics.routes.js';
import tenantApiRoutes from './routes/tenant-api.routes.js';
import adminRoutes from './routes/admin.routes.js';
import demoRoutes from './routes/demo.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Behind Railway/Fastly: respect X-Forwarded-Proto so req.protocol is 'https'.
  app.set('trust proxy', true);

  // Serve frontend static files BEFORE Helmet/CORS — they don't need security headers
  const frontendDist = path.resolve(process.cwd(), '../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
  }

  // Serve SDK dist as a static asset
  const sdkDir = path.resolve(process.cwd(), '../sdk');
  if (fs.existsSync(sdkDir)) {
    app.use('/sdk', express.static(sdkDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }));
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "https://api.qrserver.com"],
        imgSrc: ["'self'", "data:", "https://api.qrserver.com"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginEmbedderPolicy: false,
  }));
  // CORS: allow the request's own host (self-origin) automatically, plus any
  // origins listed in ALLOWED_ORIGINS / PUBLIC_URL. This means the frontend
  // hitting its own backend works without any env-var configuration; env vars
  // are only needed to allow *third-party* origins (e.g., customer SDK hosts).
  // In development, all origins are allowed for convenience.
  const isProduction = process.env.NODE_ENV === 'production';
  const publicUrl = process.env.PUBLIC_URL || '';
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  const allAllowed = new Set<string>();
  if (allowedOrigins) allowedOrigins.forEach(o => allAllowed.add(o.replace(/\/+$/, '')));
  if (publicUrl) allAllowed.add(publicUrl.trim().replace(/\/+$/, ''));

  console.log(`CORS config: explicit allowlist=[${[...allAllowed].join(', ')}] (PUBLIC_URL=${publicUrl}, NODE_ENV=${process.env.NODE_ENV}); self-origin auto-allowed.`);

  app.use((req, res, next) => {
    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.replace(/\/+$/, '');
        if (normalized === selfOrigin) {
          callback(null, true);
          return;
        }
        if (allAllowed.has(normalized)) {
          callback(null, true);
          return;
        }
        if (!isProduction) {
          callback(null, true);
          return;
        }
        console.warn(`CORS rejected origin: ${origin} (self=${selfOrigin}, allowed=[${[...allAllowed].join(', ')}])`);
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })(req, res, next);
  });
  app.use(express.json({ limit: '5mb' }));

  // Privacy policy — served as static HTML, no auth required
  app.get('/privacy', (_req, res) => {
    const policyPath = path.join(__dirname, 'assets', 'privacy-policy.html');
    if (fs.existsSync(policyPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(policyPath);
    } else {
      res.status(404).send('Privacy policy not found.');
    }
  });

  // OpenAPI spec — raw YAML
  app.get('/openapi.yaml', (_req, res) => {
    const specPath = path.join(__dirname, 'assets', 'openapi.yaml');
    if (fs.existsSync(specPath)) {
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.sendFile(specPath);
    } else {
      res.status(404).send('OpenAPI spec not found.');
    }
  });

  // API docs — Scalar UI (rendered from the OpenAPI spec above)
  app.get('/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
<head>
  <title>chickenScratch API Reference</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/openapi.yaml"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`);
  });

  app.use(healthRoutes);
  app.use(enrollmentRoutes);
  app.use(authRoutes);
  app.use(sessionRoutes);
  app.use(diagnosticsRoutes);
  app.use(tenantApiRoutes);
  app.use(adminRoutes);
  app.use(demoRoutes);

  // SPA catch-all — serve index.html for client-side routes (uses frontendDist from top of function)
  if (fs.existsSync(frontendDist)) {
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/docs' || req.path === '/privacy' || req.path === '/openapi.yaml') {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // Sentry error handler — captures thrown errors on their way out of route
  // handlers, BEFORE our generic errorHandler translates them to 500s. No-op
  // when SENTRY_DSN is unset.
  Sentry.setupExpressErrorHandler(app);

  app.use(errorHandler);

  return app;
}
