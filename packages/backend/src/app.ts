import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import healthRoutes from './routes/health.routes.js';
import enrollmentRoutes from './routes/enrollment.routes.js';
import authRoutes from './routes/auth.routes.js';
import sessionRoutes from './routes/session.routes.js';
import diagnosticsRoutes from './routes/diagnostics.routes.js';
import tenantApiRoutes from './routes/tenant-api.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  }));
  // CORS: restrict to allowed origins in production
  // Set ALLOWED_ORIGINS env var as comma-separated list (e.g., "https://example.com,https://app.example.com")
  // If not set, allows all origins (dev mode)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  app.use(cors({
    origin: allowedOrigins
      ? (origin, callback) => {
          // Allow requests with no origin (server-to-server, curl, etc.)
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      : true,
    credentials: true,
  }));
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

  // Serve SDK dist as a static asset (for <script> tag integration)
  const sdkDir = path.resolve(process.cwd(), '../sdk');
  if (fs.existsSync(sdkDir)) {
    app.use('/sdk', express.static(sdkDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }));
  }

  // Serve frontend static files
  // Railway runs from /app with `npm -w packages/backend`, so cwd = /app/packages/backend
  // The frontend dist is at /app/packages/frontend/dist = ../frontend/dist relative to cwd
  const frontendDist = path.resolve(process.cwd(), '../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));

    // SPA catch-all — serve index.html for client-side routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/docs' || req.path === '/privacy' || req.path === '/openapi.yaml') {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
