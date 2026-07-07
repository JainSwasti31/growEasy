import Papa from 'papaparse';
import type { RawRow } from '@groweasy/shared';

export interface CsvParseResult {
  headers: string[];
  rows: RawRow[];
  totalRows: number;
}

export interface CsvParseError {
  message: string;
  /** HTTP status code to return */
  status: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of columns we will process. Protects against CSV bombs. */
const MAX_COLUMNS = 200;

/** Maximum number of rows we will process in a single import. */
const MAX_ROWS = 10_000;

/**
 * Parse a CSV Buffer into structured rows.
 *
 * Hardened for Phase 6:
 * - Auto delimiter detection (comma, semicolon, tab, pipe)
 * - Duplicate headers → suffixed _2, _3, … (our convention)
 * - Ragged rows → missing fields filled with ""
 * - Non-UTF-8 encoding → latin1 fallback
 * - BOM stripping
 * - Single-column CSVs handled correctly
 * - 10 000+ row protection (returns partial + warning in response)
 * - Non-fatal parse warnings logged, never thrown
 * - Malformed JSON / extra commentary around JSON: irrelevant here (handled in aiExtractor)
 */
export function parseCsvBuffer(
  buffer: Buffer,
  originalName: string
): CsvParseResult | CsvParseError {
  // ── 1. Encoding ────────────────────────────────────────────────────────────
  let text = buffer.toString('utf8');

  // If UTF-8 decode produced replacement chars, try latin1
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }

  // Strip UTF-8 BOM
  text = text.replace(/^\uFEFF/, '');

  // Strip common Windows carriage returns from line endings before parsing
  // (PapaParse handles most of these but belt-and-suspenders for edge cases)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (!text.trim()) {
    return { message: 'The uploaded file is empty.', status: 400 };
  }

  // ── 2. Headerless parse (gives us raw rows as arrays) ─────────────────────
  const headerlessResult = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rawRows = headerlessResult.data;

  if (rawRows.length === 0) {
    return { message: 'The CSV file is empty or could not be read.', status: 400 };
  }

  // ── 3. Extract + validate headers ─────────────────────────────────────────
  const rawHeaders = (rawRows[0] as string[]).map((h) =>
    (typeof h === 'string' ? h : String(h)).trim()
  );

  if (rawHeaders.length === 0 || rawHeaders.every((h) => !h)) {
    return {
      message: 'The CSV file has no column headers in the first row.',
      status: 400,
    };
  }

  // Protect against CSV bombs / absurd column counts
  if (rawHeaders.length > MAX_COLUMNS) {
    return {
      message: `The CSV has ${rawHeaders.length} columns which exceeds the maximum of ${MAX_COLUMNS}. Please check the file.`,
      status: 422,
    };
  }

  // Handle single-column CSVs (rawHeaders.length === 1 is perfectly valid)
  // — no special treatment needed, falls through naturally.

  // ── 4. Deduplicate headers (_2, _3 convention) ────────────────────────────
  const seen = new Map<string, number>();
  const deduped = rawHeaders.map((h) => {
    const base = h || 'column';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });

  const hadDuplicates = deduped.some((h, i) => h !== rawHeaders[i]);
  if (hadDuplicates) {
    console.warn(
      `[csvParser] Duplicate headers in "${originalName}" renamed:`,
      rawHeaders
        .map((h, i) => (h !== deduped[i] ? `"${h}"→"${deduped[i]}"` : null))
        .filter(Boolean)
        .join(', ')
    );
  }

  // ── 5. Data rows ───────────────────────────────────────────────────────────
  const allDataRows = rawRows.slice(1) as string[][];

  if (allDataRows.length === 0) {
    return {
      message: 'The CSV file contains headers but no data rows.',
      status: 400,
    };
  }

  // Large CSV protection — process first MAX_ROWS, warn if truncated
  const truncated = allDataRows.length > MAX_ROWS;
  const dataRows = truncated ? allDataRows.slice(0, MAX_ROWS) : allDataRows;

  if (truncated) {
    console.warn(
      `[csvParser] "${originalName}": ${allDataRows.length} rows found, processing first ${MAX_ROWS} only.`
    );
  }

  // ── 6. Build row objects (handle ragged CSVs + strip \r residue) ──────────
  const rows: RawRow[] = dataRows.map((cells) => {
    const row: RawRow = {};
    deduped.forEach((header, colIdx) => {
      const val = cells[colIdx];
      row[header] = typeof val === 'string' ? val.replace(/\r/g, '').trim() : '';
    });
    return row;
  });

  // ── 7. Non-fatal warnings ──────────────────────────────────────────────────
  if (headerlessResult.errors.length > 0) {
    console.warn(
      `[csvParser] "${originalName}": ${headerlessResult.errors.length} non-fatal parse warning(s) — first: ${headerlessResult.errors[0]?.message}`
    );
  }

  return {
    headers: deduped,
    rows,
    totalRows: rows.length,
    ...(truncated ? { truncatedFrom: allDataRows.length } : {}),
  } as CsvParseResult;
}

/** Type guard */
export function isCsvParseError(
  result: CsvParseResult | CsvParseError
): result is CsvParseError {
  return 'status' in result;
}
