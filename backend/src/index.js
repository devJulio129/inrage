import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import passport from './middleware/passport.js';
import memberRoutes from './routes/members.js';
import attendanceRoutes from './routes/attendance.js';
import authRoutes from './routes/auth.js';
import loginLogsRoutes from './routes/loginLogs.js';
import workoutRoutes from './routes/workouts.js';
import statsRoutes from './routes/stats.js';

const app = express();

// CORS: allow all by default (dev). In production set CORS_ORIGIN to a
// comma-separated list of your deployed frontend URLs to restrict it.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : true;
app.use(cors({ origin: corsOrigins }));
app.use(express.json());
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
app.use(notFound);
app.use(errorHandler);


const PORT = process.env.PORT || 4010;

connectDB(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  });
