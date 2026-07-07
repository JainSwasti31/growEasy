import { z } from 'zod';
import { CrmRecordSchema } from './crm';

// ── Health ────────────────────────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ── POST /api/csv/parse ───────────────────────────────────────────────────────

export const ParseResponseSchema = z.object({
  totalRows: z.number(),
  headers: z.array(z.string()),
  preview: z.array(z.record(z.string())),
});

export type ParseResponse = z.infer<typeof ParseResponseSchema>;

// ── POST /api/csv/import  (non-streaming, full response) ─────────────────────

export const SkippedRowSchema = z.object({
  row: z.record(z.string()),
  reason: z.string(),
});

export type SkippedRow = z.infer<typeof SkippedRowSchema>;

export const ImportResponseSchema = z.object({
  totalRows: z.number(),
  imported: z.array(CrmRecordSchema),
  skipped: z.array(SkippedRowSchema),
  totalImported: z.number(),
  totalSkipped: z.number(),
});

export type ImportResponse = z.infer<typeof ImportResponseSchema>;

// ── POST /api/csv/import/stream  (SSE streaming events) ──────────────────────
//
// The server sends a stream of newline-delimited JSON events.
// Each line is a JSON object with a `type` discriminant field.
//
// Event flow:
//   { type: "start",    totalRows, totalBatches }
//   { type: "batch",    batchIndex, totalBatches, imported: CrmRecord[],
//                       skipped: SkippedRow[], runningImported, runningSkipped }
//   ...repeated for each batch...
//   { type: "done",     totalRows, imported: CrmRecord[],
//                       skipped: SkippedRow[], totalImported, totalSkipped }
//
// On error before streaming starts, the server returns a normal JSON error
// response (4xx/5xx) — check res.ok before reading the stream.
// On error mid-stream, the server sends:
//   { type: "error",    message: string }

export interface StreamStartEvent {
  type: 'start';
  totalRows: number;
  totalBatches: number;
}

export interface StreamBatchEvent {
  type: 'batch';
  batchIndex: number;   // 0-based
  totalBatches: number;
  imported: import('./crm').CrmRecord[];
  skipped: SkippedRow[];
  runningImported: number;
  runningSkipped: number;
}

export interface StreamDoneEvent {
  type: 'done';
  totalRows: number;
  imported: import('./crm').CrmRecord[];
  skipped: SkippedRow[];
  totalImported: number;
  totalSkipped: number;
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

export type StreamEvent =
  | StreamStartEvent
  | StreamBatchEvent
  | StreamDoneEvent
  | StreamErrorEvent;

// ── Generic API error shape ───────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ── POST /api/csv/retry ───────────────────────────────────────────────────────
// Retry a subset of previously-skipped raw rows (no file upload). The request
// body contains the original headers and the subset of raw rows to reprocess.
export const RetryRequestSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.record(z.string())),
});

export type RetryRequest = z.infer<typeof RetryRequestSchema>;

// Response shape reuses the ImportResponseSchema semantics with totals
export const RetryResponseSchema = ImportResponseSchema.extend({});
export type RetryResponse = z.infer<typeof RetryResponseSchema>;
