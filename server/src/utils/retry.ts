/** Retry a promise-returning function with exponential backoff.
 *  - Does not retry client errors (4xx) except 429 (rate limit).
 *  - Honors explicit "retry in Xs" hints when present in the error message.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 300): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (isClientErrorNonRetriable(err)) throw err;

      if (attempt < maxRetries) {
        const retryAfterMs = extractRetryAfterMs(err);
        const backoffMs = retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
        console.warn(`[retry] attempt ${attempt + 1} failed (${summarizeError(err)}). retrying in ${Math.round(backoffMs/1000)}s`);
        await sleep(Math.min(backoffMs, 60_000));
      }
    }
  }

  throw lastError;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isClientErrorNonRetriable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;

  // Try to parse an embedded numeric code (Gemini embeds JSON strings)
  const match = msg.match(/"code"\s*:\s*(\d+)/);
  if (!match) return false;
  const code = parseInt(match[1], 10);
  return code >= 400 && code < 500 && code !== 429;
}

function extractRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

function summarizeError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown';
  const match = err.message.match(/"code"\s*:\s*(\d+)/);
  return match ? match[1] : err.message.slice(0, 80).replace(/\s+/g, ' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
