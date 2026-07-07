import type { CrmRecord, RawRow } from '@groweasy/shared';
import { createAiProvider, type AiProvider } from './aiProviders';
import {
  buildSystemPrompt,
  buildUserMessage,
  buildRetryMessage,
} from './extractionPrompt';
import {
  AiBatchResponseSchema,
  extractJsonFromText,
} from './extractionSchema';

// ── Config ────────────────────────────────────────────────────────────────────

/** Rows per AI call. 25 is a good balance: enough context for the model to
 *  detect patterns across rows, small enough to stay within token limits. */
const BATCH_SIZE = 25;

/** Max provider-call retries (network/429) per attempt. */
const PROVIDER_MAX_RETRIES: number = process.env.PROVIDER_MAX_RETRIES ? parseInt(process.env.PROVIDER_MAX_RETRIES, 10) : 2;

/** Max parse/validation retries (retry with stricter prompt) per batch. */
const PARSE_MAX_RETRIES: number = process.env.PARSE_MAX_RETRIES ? parseInt(process.env.PARSE_MAX_RETRIES, 10) : 1;

/**
 * Minimum delay between sequential batch calls (ms).
 * Prevents hammering the API when processing large files.
 * At 200ms this adds ~8s overhead to a 400-row (16-batch) import —
 * a reasonable trade-off against rate-limit 429s.
 */
const INTER_BATCH_DELAY_MS = process.env.AI_INTER_BATCH_DELAY_MS ? parseInt(process.env.AI_INTER_BATCH_DELAY_MS, 10) : 200;

/**
 * When a 429 rate-limit error is detected, wait this long before continuing
 * (on top of any Retry-After hint in the error message).
 * Gemini free tier enforces per-minute limits; 65s covers a full reset window.
 */
const RATE_LIMIT_BACKOFF_MS = process.env.AI_RATE_LIMIT_BACKOFF_MS ? parseInt(process.env.AI_RATE_LIMIT_BACKOFF_MS, 10) : 65_000;

// Import centralized retry util
import { withRetry } from '../utils/retry';

// ── Public interface ──────────────────────────────────────────────────────────

export interface SkippedRow {
  row: RawRow;
  reason: string;
}

export interface ExtractionResult {
  records: CrmRecord[];
  skipped: SkippedRow[];
  batchCount: number;
  totalInputRows: number;
}

/** Called after each batch completes — used by the SSE streaming endpoint. */
export type BatchCallback = (event: {
  batchIndex: number;
  totalBatches: number;
  batchRecords: CrmRecord[];
  batchSkipped: SkippedRow[];
  runningImported: number;
  runningSkipped: number;
}) => void;

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Extract CRM records from arbitrary CSV rows using an LLM.
 *
 * Algorithm:
 * 1. Split rows into batches of BATCH_SIZE.
 * 2. For each batch, send to AI with the extraction prompt.
 * 3. Parse and validate the AI response with Zod.
 * 4. On validation failure, retry once with a stricter prompt.
 * 5. If retry also fails, mark all rows in that batch as skipped.
 * 6. Aggregate results across all batches.
 */
export async function extractCrmRecords(
  rows: RawRow[],
  headers: string[],
  onBatch?: BatchCallback
): Promise<ExtractionResult> {
  const provider = createAiProvider();
  const systemPrompt = buildSystemPrompt(headers);

  const batches = chunk(rows, BATCH_SIZE);
  console.log(
    `[aiExtractor] Starting extraction via ${provider.name}: ` +
      `${rows.length} rows → ${batches.length} batch(es) of up to ${BATCH_SIZE}`
  );

  const allRecords: CrmRecord[] = [];
  const allSkipped: SkippedRow[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`[aiExtractor] Batch ${batchIdx + 1}/${batches.length}: processing ${batch.length} rows`);

    const result = await processBatchWithRetry(provider, systemPrompt, batch, batchIdx, batches.length);

    allRecords.push(...result.records);
    allSkipped.push(...result.skipped);

    console.log(`[aiExtractor] Batch ${batchIdx + 1} done: ${result.records.length} extracted, ${result.skipped.length} skipped`);

    // Fire per-batch callback for SSE streaming
    onBatch?.({
      batchIndex: batchIdx,
      totalBatches: batches.length,
      batchRecords: result.records,
      batchSkipped: result.skipped,
      runningImported: allRecords.length,
      runningSkipped: allSkipped.length,
    });

    if (batchIdx < batches.length - 1) {
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  console.log(`[aiExtractor] Complete: ${allRecords.length} records, ${allSkipped.length} skipped`);

  return { records: allRecords, skipped: allSkipped, batchCount: batches.length, totalInputRows: rows.length };
}

// ── Batch processing with retry ───────────────────────────────────────────────

async function processBatchWithRetry(
  provider: AiProvider,
  systemPrompt: string,
  batch: RawRow[],
  batchIdx: number,
  totalBatches: number
): Promise<{ records: CrmRecord[]; skipped: SkippedRow[] }> {
  // ── Attempt 1 ──────────────────────────────────────────────────────────────
  const userMessage = buildUserMessage(batch, batchIdx, totalBatches);

  // Helper to call provider.chat with provider-level retries (network/429)
  const callProvider = async (msg: string) =>
    withRetry(() => provider.chat(systemPrompt, msg), PROVIDER_MAX_RETRIES, 500);

  // First, attempt provider call + parse. If parse fails, retry with stricter prompt
  // up to PARSE_MAX_RETRIES times. Provider-level transient errors are handled
  // by withRetry (including 429 with Retry-After hints).
  let attempt = 0;
  let lastParseError: unknown = null;

  while (attempt <= PARSE_MAX_RETRIES) {
    const isRetryAttempt = attempt > 0;
    const msg = isRetryAttempt
      ? buildRetryMessage(batch, 'Previous response was invalid or unparseable.')
      : userMessage;

    try {
      if (isRetryAttempt) console.log(`[aiExtractor] Batch ${batchIdx + 1}: parse retry ${attempt} with stricter prompt…`);

      const rawText = await callProvider(msg);
      return parseAndValidate(rawText, batch);
    } catch (err) {
      // Distinguish between provider-level transient errors (handled by withRetry)
      // and parse/validation failures thrown by parseAndValidate(). If parse
      // validation failed, we loop to retry with stricter prompt.
      if (isRateLimitError(err)) {
        const waitMs = extractRetryAfterMs(err) ?? RATE_LIMIT_BACKOFF_MS;
        console.warn(`[aiExtractor] Batch ${batchIdx + 1}: rate-limited. Waiting ${Math.round(waitMs / 1000)}s before continuing…`);
        await sleep(waitMs);
        // continue to next loop iteration which will retry the parse (or provider)
      }

      const msg = err instanceof Error ? err.message : String(err);
      // If this looks like a JSON/Zod validation failure, try again up to PARSE_MAX_RETRIES
      if (msg.includes('Zod validation failed') || msg.includes('Could not extract valid JSON')) {
        console.warn(`[aiExtractor] Batch ${batchIdx + 1} parse/validation failed: ${msg}`);
        lastParseError = err;
        attempt++;
        // small backoff between parse retries to avoid tight loops
        await sleep(500 + Math.random() * 300);
        continue;
      }

      // Otherwise, this is an unexpected provider error — mark batch skipped
      console.error(`[aiExtractor] Batch ${batchIdx + 1} failed: ${msg}. Marking ${batch.length} rows as skipped.`);
      return markBatchAsSkipped(batch, `ai_validation_failed: ${msg}`);
    }
  }

  // If we exit loop, parse retries exhausted
  const parseMsg = lastParseError instanceof Error ? lastParseError.message : String(lastParseError);
  console.error(`[aiExtractor] Batch ${batchIdx + 1}: parse retries exhausted: ${parseMsg}. Marking ${batch.length} rows as skipped.`);
  return markBatchAsSkipped(batch, `ai_validation_failed: ${parseMsg}`);
}

// ── Parse + validate AI response ─────────────────────────────────────────────

export function parseAndValidate(
  rawText: string,
  batch: RawRow[]
): { records: CrmRecord[]; skipped: SkippedRow[] } {
  // 1. Extract JSON (handles markdown fences, surrounding text, etc.)
  const parsed = extractJsonFromText(rawText);

  // 2. Validate against Zod schema
  const validation = AiBatchResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `Zod validation failed: ${validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
    );
  }

  const { records, skipped: aiSkipped } = validation.data;

  // 3. Apply the skip rule: any record with no email AND no mobile → skip
  const validRecords: CrmRecord[] = [];
  const skippedRecords: SkippedRow[] = [];
  const seenSourceIndices = new Set<number>();

  records.forEach((record, idx) => {
    const sourceIndex = record.sourceRowIndex;
    let originalRow: RawRow | undefined;

    if (
      sourceIndex == null ||
      sourceIndex < 0 ||
      sourceIndex >= batch.length ||
      seenSourceIndices.has(sourceIndex)
    ) {
      console.warn(
        `[aiExtractor] record ${idx} has invalid or duplicate sourceRowIndex=${sourceIndex}. ` +
          'Falling back to batch position.'
      );
      originalRow = batch[idx];
    } else {
      originalRow = batch[sourceIndex];
      seenSourceIndices.add(sourceIndex);
    }

    const hasEmail = Boolean(record.email?.trim());
    const hasMobile = Boolean(record.mobile_without_country_code?.trim());

    if (!hasEmail && !hasMobile) {
      skippedRecords.push({
        row: originalRow ?? {},
        reason: 'No email or mobile number found',
      });
    } else {
      const { sourceRowIndex, ...sanitizedRecord } = record;
      validRecords.push(sanitizedRecord);
    }
  });

  // 4. Resolve AI-reported skipped rows back to original batch rows
  aiSkipped.forEach(({ rowIndex, reason }) => {
    const originalRow = batch[rowIndex] ?? {};
    skippedRecords.push({ row: originalRow, reason });
  });

  return { records: validRecords, skipped: skippedRecords };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function markBatchAsSkipped(
  batch: RawRow[],
  reason: string
): { records: CrmRecord[]; skipped: SkippedRow[] } {
  return {
    records: [],
    skipped: batch.map((row) => ({ row, reason })),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true if the error is a 429 rate-limit response. */
function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Gemini embeds the HTTP code in a JSON payload; also check status text
  return (
    msg.includes('"code":429') ||
    msg.includes('"code": 429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.toLowerCase().includes('rate-limit') ||
    msg.toLowerCase().includes('quota exceeded')
  );
}

/**
 * Extract the Retry-After hint from Gemini's error message.
 * Gemini includes either "Please retry in Xs" or "retryDelay":"Xs".
 */
function extractRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000);
  return null;
}
