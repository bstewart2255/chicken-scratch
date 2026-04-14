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
        // Allow inline styles for the privacy policy page
        styleSrc: ["'self'", "'unsafe-inline'"],
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

  app.use(errorHandler);

  return app;
}
