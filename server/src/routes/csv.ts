import express, { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { csvUpload } from '../utils/upload';
import { parseCsvBuffer, isCsvParseError } from '../utils/csvParser';
import { sendError } from '../utils/errors';
import { extractCrmRecords } from '../services/aiExtractor';
import { withRetry } from '../utils/retry';
import type { ParseResponse, ImportResponse, StreamEvent, SkippedRow } from '@groweasy/shared';
import type { CrmRecord } from '@groweasy/shared';
import type { RetryRequest, RetryResponse } from '@groweasy/shared';

const router = Router();

const PARSE_PREVIEW_ROWS = 20;

// ── Shared multer middleware ───────────────────────────────────────────────────

function multerMiddleware(req: Request, res: Response, next: NextFunction) {
  csvUpload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 413, 'File too large. Maximum allowed size is 10 MB.');
      }
      return sendError(res, 400, `Upload error: ${err.message}`);
    }

    if (err instanceof Error) {
      return sendError(res, 415, err.message);
    }

    next(err);
  });
}

// ── POST /api/csv/parse ───────────────────────────────────────────────────────
/**
 * Parse only — no AI. Returns headers, total row count, and a preview.
 * Stateless: the file is never persisted.
 */
router.post('/parse', multerMiddleware, (req: Request, res: Response) => {
  if (!req.file) {
    return sendError(res, 400, 'No file uploaded. Send a CSV file in the "file" field.');
  }

  const parseResult = parseCsvBuffer(req.file.buffer, req.file.originalname);

  if (isCsvParseError(parseResult)) {
    return sendError(res, parseResult.status, parseResult.message);
  }

  const { headers, rows, totalRows } = parseResult;

  const body: ParseResponse = {
    totalRows,
    headers,
    preview: rows.slice(0, PARSE_PREVIEW_ROWS),
  };

  return res.json(body);
});

// ── POST /api/csv/import ──────────────────────────────────────────────────────
/**
 * Full pipeline (non-streaming): parse CSV → AI extraction → full JSON response.
 * Kept for backward compatibility and non-browser clients.
 */
router.post(
  '/import',
  multerMiddleware,
  async (req: Request, res: Response) => {
    if (!req.file) {
      return sendError(res, 400, 'No file uploaded. Send a CSV file in the "file" field.');
    }

    const parseResult = parseCsvBuffer(req.file.buffer, req.file.originalname);
    if (isCsvParseError(parseResult)) {
      return sendError(res, parseResult.status, parseResult.message);
    }

    const { headers, rows, totalRows } = parseResult;
    console.log(`[import] "${req.file.originalname}": ${totalRows} rows, ${headers.length} columns`);

    let extractionResult;
    try {
      extractionResult = await withRetry(() => extractCrmRecords(rows, headers), 2, 300);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown AI error';
      console.error(`[import] AI extraction failed completely: ${message}`);
      return sendError(res, 502, 'AI extraction failed. Please try again shortly.', message);
    }

    const { records: imported, skipped } = extractionResult;
    const body: ImportResponse = { totalRows, imported, skipped, totalImported: imported.length, totalSkipped: skipped.length };
    console.log(`[import] Done: ${imported.length} imported, ${skipped.length} skipped`);
    return res.json(body);
  }
);

// ── POST /api/csv/import/stream ───────────────────────────────────────────────
/**
 * Streaming version using newline-delimited JSON (NDJSON).
 *
 * Why NDJSON over SSE:
 * - fetch() streaming works natively without EventSource (which is GET-only)
 * - No extra `data:` prefix parsing needed
 * - Works through proxies that buffer SSE
 * - Each line is a complete JSON event object — easy to parse incrementally
 *
 * Response: Content-Type: application/x-ndjson, chunked transfer encoding.
 * Each line is a JSON StreamEvent. Connection stays open until done/error event.
 */
router.post(
  '/import/stream',
  multerMiddleware,
  async (req: Request, res: Response) => {
    if (!req.file) {
      return sendError(res, 400, 'No file uploaded. Send a CSV file in the "file" field.');
    }

    const parseResult = parseCsvBuffer(req.file.buffer, req.file.originalname);
    if (isCsvParseError(parseResult)) {
      return sendError(res, parseResult.status, parseResult.message);
    }

    const { headers, rows, totalRows } = parseResult;
    const totalBatches = Math.ceil(totalRows / 25);

    console.log(`[import/stream] "${req.file.originalname}": ${totalRows} rows → ${totalBatches} batches`);

    // ── Set up streaming response ─────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    function sendEvent(event: StreamEvent): void {
      if (!res.writableEnded) {
        res.write(JSON.stringify(event) + '\n');
      }
    }

    // ── Start event ───────────────────────────────────────────────────────────
    sendEvent({ type: 'start', totalRows, totalBatches });

    const allImported: CrmRecord[] = [];
    const allSkipped: SkippedRow[] = [];

    try {
      await extractCrmRecords(rows, headers, (batchEvent) => {
        allImported.push(...batchEvent.batchRecords);
        allSkipped.push(...batchEvent.batchSkipped);

        sendEvent({
          type: 'batch',
          batchIndex: batchEvent.batchIndex,
          totalBatches: batchEvent.totalBatches,
          imported: batchEvent.batchRecords,
          skipped: batchEvent.batchSkipped,
          runningImported: batchEvent.runningImported,
          runningSkipped: batchEvent.runningSkipped,
        });
      });

      // ── Done event ────────────────────────────────────────────────────────
      sendEvent({
        type: 'done',
        totalRows,
        imported: allImported,
        skipped: allSkipped,
        totalImported: allImported.length,
        totalSkipped: allSkipped.length,
      });

      console.log(`[import/stream] Done: ${allImported.length} imported, ${allSkipped.length} skipped`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown AI error';
      console.error(`[import/stream] Fatal error: ${message}`);
      sendEvent({ type: 'error', message: 'AI extraction failed. Please try again shortly.' });
    } finally {
      res.end();
    }
  }
);

export default router;

// ── POST /api/csv/retry ──────────────────────────────────────────────────────
/**
 * Re-run AI extraction for a subset of previously-skipped rows.
 * Request body: { headers: string[], rows: RawRow[] }
 * Returns the same shape as the non-streaming import response but scoped to
 * the provided rows.
 */
router.post('/retry', express.json(), async (req: Request, res: Response) => {
  const body = req.body as unknown;
  try {
    // lightweight validation using shared zod schema when available
    // (avoid importing zod here to keep runtime small; rely on shape)
    const { headers, rows } = body as RetryRequest;
    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return sendError(res, 400, 'Invalid request: expected { headers: string[], rows: object[] }');
    }

    console.log(`[retry] Reprocessing ${rows.length} row(s) via AI`);

    let extractionResult;
    try {
      extractionResult = await withRetry(() => extractCrmRecords(rows, headers), 2, 300);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown AI error';
      console.error(`[retry] AI extraction failed completely: ${message}`);
      return sendError(res, 502, 'AI extraction failed. Please try again shortly.', message);
    }

    const { records: imported, skipped } = extractionResult;
    const bodyOut: RetryResponse = { totalRows: rows.length, imported, skipped, totalImported: imported.length, totalSkipped: skipped.length } as unknown as RetryResponse;
    console.log(`[retry] Done: ${imported.length} imported, ${skipped.length} skipped`);
    return res.json(bodyOut);
  } catch (err) {
    console.error('[retry] Unexpected error:', err);
    return sendError(res, 500, 'Unexpected server error');
  }
});
