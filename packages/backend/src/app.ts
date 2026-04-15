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
  app.use(cors({ origin: true }));
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

  // Serve SDK test page in development
  if (process.env.NODE_ENV !== 'production') {
    const sdkDir = path.resolve(process.cwd(), '../sdk');
    app.use('/sdk', express.static(sdkDir));
  }

  // Serve frontend static files in production
  // Use cwd-relative path (Railway runs from repo root)
  const frontendDist = path.resolve(process.cwd(), 'packages/frontend/dist');
  console.log(`Frontend dist path: ${frontendDist}, exists: ${fs.existsSync(frontendDist)}`);
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));

    // SPA catch-all: serve index.html for any non-API route
    app.get('*', (req, res, next) => {
      // Don't catch API routes or other known paths
      if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/docs' || req.path === '/privacy' || req.path === '/openapi.yaml') {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
