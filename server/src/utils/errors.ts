import type { Response } from 'express';

/**
 * Send a consistent JSON error response.
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  details?: string
): void {
  res.status(status).json({ error, ...(details ? { details } : {}) });
}
