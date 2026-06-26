import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import classRoutes from './routes/classes.js';
import classTemplateRoutes from './routes/classTemplates.js';
import postRoutes from './routes/posts.js';
import reactionRoutes from './routes/reactions.js';
import commentRoutes from './routes/comments.js';
import messageRoutes from './routes/messages.js';
import businessRoutes from './routes/business.js';
import membershipRoutes from './routes/memberships.js';
import notificationRoutes from './routes/notifications.js';
import publicProfileRoutes from './routes/publicProfiles.js';

// Builds the Express app without connecting to the database or listening on a
// port, so tests can mount it on an ephemeral port. index.js does the rest.
export function createApp() {
  const app = express();

  // Render runs behind a proxy: needed so req.ip is the real client IP
  // (rate limiting and the Accesos log depend on it).
  app.set('trust proxy', 1);
  app.use(helmet());

  // CORS: allow all by default (dev). In production set CORS_ORIGIN to a
  // comma-separated list of your deployed frontend URLs to restrict it.
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : true;
  app.use(cors({ origin: corsOrigins }));
  // 10mb: profile photos travel as base64 data-URIs (default 100kb rejects them).
  app.use(express.json({ limit: '10mb' }));
  app.use(passport.initialize());

  // Brute-force protection. The gym shares one public IP, so the login
  // window is generous; registration is rarer and gets a tighter one.
  const limiterOpts = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
  };
  app.use('/api/auth/login', rateLimit({ ...limiterOpts, limit: 100 }));
  app.use('/api/auth/google', rateLimit({ ...limiterOpts, limit: 100 }));
  app.use('/api/auth/register', rateLimit({ ...limiterOpts, limit: 30 }));

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
  app.use('/api/classes', classRoutes);
  app.use('/api/class-templates', classTemplateRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/reactions', reactionRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/admin/business', businessRoutes);
  app.use('/api/admin/memberships', membershipRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api', publicProfileRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
