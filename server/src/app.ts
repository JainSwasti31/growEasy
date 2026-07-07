import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import healthRouter from './routes/health';
import csvRouter from './routes/csv';
import adminRouter from './routes/admin';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api', healthRouter);
app.use('/api/csv', csvRouter);
app.use('/admin', adminRouter);

// ── 404 fallback ──────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any error thrown synchronously or passed to next(err).
// Prevents unhandled Express errors from returning raw stack traces.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[app] Unhandled error:', err);
  const message =
    err instanceof Error ? err.message : 'An unexpected server error occurred.';
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

export default app;
