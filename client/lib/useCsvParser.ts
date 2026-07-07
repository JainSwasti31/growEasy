'use client';

import { useCallback, useState } from 'react';
import Papa from 'papaparse';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export type ParseStatus = 'idle' | 'parsing' | 'done' | 'error';

export interface UseCsvParserReturn {
  status: ParseStatus;
  result: ParseResult | null;
  error: string | null;
  parse: (file: File) => void;
  reset: () => void;
}

// How many rows to display in the preview table
export const PREVIEW_ROW_LIMIT = 100;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCsvParser(): UseCsvParserReturn {
  const [status, setStatus] = useState<ParseStatus>('idle');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  const parse = useCallback((file: File) => {
    setStatus('parsing');
    setResult(null);
    setError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // Let PapaParse detect delimiter (handles comma, semicolon, tab, pipe, etc.)
      dynamicTyping: false, // keep everything as strings — AI will interpret types
      complete(results) {
        // ── Validate parsed output ───────────────────────────────────────────
        if (results.errors.length > 0 && results.data.length === 0) {
          const msg = results.errors[0]?.message ?? 'Unknown parse error';
          setError(`Could not parse the CSV file: ${msg}`);
          setStatus('error');
          return;
        }

        const headers = results.meta.fields ?? [];

        if (headers.length === 0) {
          setError('The CSV file has no column headers. Please check the file and try again.');
          setStatus('error');
          return;
        }

        if (results.data.length === 0) {
          setError('The CSV file has headers but no data rows. Please check the file and try again.');
          setStatus('error');
          return;
        }

        // ── Success ──────────────────────────────────────────────────────────
        setResult({
          headers,
          rows: results.data,
          totalRows: results.data.length,
        });
        setStatus('done');
        console.log(
          `[useCsvParser] Parsed ${results.data.length} rows, ${headers.length} columns.`,
          results.errors.length > 0
            ? `(${results.errors.length} non-fatal warnings)`
            : ''
        );
      },
      error(err) {
        setError(`Failed to read the file: ${err.message}`);
        setStatus('error');
      },
    });
  }, []);

  return { status, result, error, parse, reset };
}
