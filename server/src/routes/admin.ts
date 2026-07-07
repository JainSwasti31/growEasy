import { Router, type Request, type Response } from 'express';

const router = Router();

/**
 * Protected restart endpoint. POST with header `x-restart-token` equal to
 * process.env.RESTART_TOKEN triggers a graceful restart (process.exit(0)).
 * This is intended for local/dev use only and must be protected by a secret.
 */
router.post('/restart', (req: Request, res: Response) => {
  const token = req.headers['x-restart-token'] as string | undefined;
  const expected = process.env.RESTART_TOKEN;

  if (!expected) {
    return res.status(403).json({ error: 'Restart token not configured on server' });
  }

  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Invalid restart token' });
  }

  res.json({ status: 'restarting' });
  console.log('[admin] Restart triggered via /admin/restart');

  // Give the response a moment to flush then exit.
  setTimeout(() => process.exit(0), 250);
});

export default router;
