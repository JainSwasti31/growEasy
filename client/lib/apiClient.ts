import type { ImportResponse, RetryResponse, StreamEvent, StreamBatchEvent, StreamDoneEvent } from '@groweasy/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const IMPORT_TIMEOUT_MS = 3 * 60 * 1000;

// ── Non-streaming import (kept for compatibility) ─────────────────────────────

export async function importCsv(
  file: File,
  onProgress?: (message: string) => void
): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append('file', file);
  onProgress?.('Uploading file…');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/csv/import`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }
    throw new Error('Could not reach the server. Please check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errorMessage = `Server error (${res.status})`;
    try {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const body = await res.json();
        errorMessage = body.error ?? errorMessage;
      } else {
        errorMessage = `Server returned ${res.status}. Please try again shortly.`;
      }
    } catch { /* use default */ }
    throw new Error(errorMessage);
  }

  onProgress?.('Processing complete.');
  return res.json() as Promise<ImportResponse>;
}

// ── Streaming import ──────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onStart?: (totalRows: number, totalBatches: number) => void;
  onBatch?: (event: StreamBatchEvent) => void;
  onDone?: (event: StreamDoneEvent) => void;
  onError?: (message: string) => void;
}

/**
 * POST /api/csv/import/stream
 *
 * Reads the NDJSON stream and fires callbacks as each event arrives.
 * Returns a promise that resolves when the stream ends (done or error).
 *
 * Disconnect / network drop: the promise rejects with an error message,
 * giving the caller the partial results accumulated via onBatch callbacks.
 */
export async function importCsvStream(
  file: File,
  callbacks: StreamCallbacks
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/csv/import/stream`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }
    throw new Error('Could not reach the server. Please check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  // Pre-stream error (parse failure, file too large, etc.)
  if (!res.ok) {
    let errorMessage = `Server error (${res.status})`;
    try {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const body = await res.json();
        errorMessage = body.error ?? errorMessage;
      }
    } catch { /* use default */ }
    throw new Error(errorMessage);
  }

  // ── Read the NDJSON stream line by line ────────────────────────────────────
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable.');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on newlines — each complete line is one JSON event
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // last element may be incomplete

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event: StreamEvent;
        try {
          event = JSON.parse(trimmed) as StreamEvent;
        } catch {
          console.warn('[importCsvStream] Failed to parse line:', trimmed);
          continue;
        }

        switch (event.type) {
          case 'start':
            callbacks.onStart?.(event.totalRows, event.totalBatches);
            break;
          case 'batch':
            callbacks.onBatch?.(event);
            break;
          case 'done':
            callbacks.onDone?.(event);
            break;
          case 'error':
            callbacks.onError?.(event.message);
            break;
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as StreamEvent;
        if (event.type === 'done') callbacks.onDone?.(event);
        else if (event.type === 'error') callbacks.onError?.(event.message);
      } catch { /* incomplete chunk, ignore */ }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The stream disconnected unexpectedly.';
    callbacks.onError?.(message);
    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }
}

export async function retryCsvRows(headers: string[], rows: Record<string, string>[]): Promise<RetryResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/csv/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers, rows }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }
    throw new Error('Could not reach the server. Please check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errorMessage = `Server error (${res.status})`;
    try {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const body = await res.json();
        errorMessage = body.error ?? errorMessage;
      }
    } catch { /* use default */ }
    throw new Error(errorMessage);
  }

  return res.json() as Promise<RetryResponse>;
}
