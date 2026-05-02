import './utils/env'; // loads .env and validates JWT_SECRET before anything else
import express from 'express';
import path from 'path';
import { startReminderScheduler } from './services/reminderScheduler';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/auth';
import itemRoutes from './routes/items';
import departmentRoutes from './routes/departments';
import reminderRoutes from './routes/reminders';
import experienceRoutes from './routes/experiences';
import reportRoutes from './routes/reports';
import subStatusRoutes from './routes/subStatus';
import categoryRoutes from './routes/categories';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './utils/prisma';

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers
app.use(helmet());

// CORS — restrict to configured origins in production
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn('WARNING: ALLOWED_ORIGINS not set — CORS is open to all origins');
}
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins, credentials: false } : undefined));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many registration attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});
const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many report generation requests, please wait a moment' },
  standardHeaders: true,
  legacyHeaders: false,
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/reset-password', resetPasswordLimiter);
app.use('/api/reports/generate', reportLimiter);

// Body parser with size limit (AI report content can be large)
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/experiences', experienceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sub-status', subStatusRoutes);
app.use('/api/categories', categoryRoutes);

// Health check — probes the database connection
app.get('/api/health', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

// 404 for unmatched /api routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve frontend static files (production build)
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Standalone pages — must be before the SPA wildcard so Vue Router doesn't intercept them
app.get('/forgot-password', (_req, res) => res.sendFile(path.join(distPath, 'forgot-password.html')));
app.get('/reset-password',  (_req, res) => res.sendFile(path.join(distPath, 'reset-password.html')));
app.get('/admin/users',     (_req, res) => res.sendFile(path.join(distPath, 'admin-users.html')));

// SPA fallback — let Vue Router handle all other non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startReminderScheduler();
});
