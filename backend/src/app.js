import express from 'express';
import cors from 'cors';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import passport from './middleware/passport.js';
import memberRoutes from './routes/members.js';
import attendanceRoutes from './routes/attendance.js';
import authRoutes from './routes/auth.js';
import loginLogsRoutes from './routes/loginLogs.js';
import workoutRoutes from './routes/workouts.js';
import statsRoutes from './routes/stats.js';
import gymInfoRoutes from './routes/gymInfo.js';
import prRoutes from './routes/prs.js';

// Builds the Express app without connecting to the database or listening on a
// port, so tests can mount it on an ephemeral port. index.js does the rest.
export function createApp() {
  const app = express();

  // CORS: allow all by default (dev). In production set CORS_ORIGIN to a
  // comma-separated list of your deployed frontend URLs to restrict it.
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : true;
  app.use(cors({ origin: corsOrigins }));
  // 10mb: profile photos travel as base64 data-URIs (default 100kb rejects them).
  app.use(express.json({ limit: '10mb' }));
  app.use(passport.initialize());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'inrage-backend' });
  });

  app.use('/api/attendances', attendanceRoutes);
  app.use('/api/members', memberRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/login-logs', loginLogsRoutes);
  app.use('/api/workouts', workoutRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/gym-info', gymInfoRoutes);
  app.use('/api/prs', prRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
