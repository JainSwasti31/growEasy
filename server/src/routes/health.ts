import { Router } from 'express';
import type { HealthResponse } from '@groweasy/shared';

const router = Router();

/**
 * GET /api/health
 * Simple liveness check — returns { status: "ok" }.
 */
router.get('/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok' };
  res.json(body);
});

export default router;
