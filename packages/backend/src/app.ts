import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import healthRoutes from './routes/health.routes.js';
import enrollmentRoutes from './routes/enrollment.routes.js';
import authRoutes from './routes/auth.routes.js';
import sessionRoutes from './routes/session.routes.js';
import diagnosticsRoutes from './routes/diagnostics.routes.js';
import tenantApiRoutes from './routes/tenant-api.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '5mb' }));

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
