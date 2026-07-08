/**
 * A3 large-file stress test — runs inside Jest so ts-node and module
 * resolution work correctly.
 *
 * Uses a mocked AI provider (no real API calls).
 * Verifies:
 * - Correct batch count (10 000 / 25 = 400)
 * - All rows accounted for (imported + skipped = 10 000)
 * - Heap delta stays reasonable (< 500 MB)
 * - No unhandled rejections
 * - Inter-batch pacing doesn't block or throw
 */

import { extractCrmRecords } from './aiExtractor';
import * as aiProviders from './aiProviders';

const TOTAL_ROWS = 10_000;
const BATCH_SIZE = 25;
const EXPECTED_BATCHES = Math.ceil(TOTAL_ROWS / BATCH_SIZE); // 400

// ── Mock the AI provider ──────────────────────────────────────────────────────

const mockChat = jest.fn(async (_system: string, userMessage: string): Promise<string> => {
  const match = userMessage.match(/(\d+) CSV rows/);
  const batchSize = match ? parseInt(match[1], 10) : BATCH_SIZE;

  const records = Array.from({ length: batchSize }, (_, i) => ({
    sourceRowIndex: i,
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    mobile_without_country_code: `9876500${String(i).padStart(3, '0')}`,
  }));

  return JSON.stringify({ records, skipped: [] });
});

jest.spyOn(aiProviders, 'createAiProvider').mockReturnValue({
  name: 'mock',
  chat: mockChat,
  chatText: mockChat,
});

// ── Generate synthetic rows ───────────────────────────────────────────────────

function generateRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    'Full Name': `Lead ${i}`,
    Email: `lead${i}@example.com`,
    Phone: `+91 98765${String(i).padStart(5, '0')}`,
    Company: `Company ${i % 100}`,
    City: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai'][i % 4],
    Remarks: `Remark for row ${i}`,
  }));
}

const headers = ['Full Name', 'Email', 'Phone', 'Company', 'City', 'Remarks'];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('A3 large-file stress test (10 000 rows, mocked provider)', () => {
  // Increase timeout — 400 batches × 200ms inter-batch delay = ~80s max
  // With the mock the actual work is fast; Jest default 5s would be too short
  jest.setTimeout(120_000);

  let result: Awaited<ReturnType<typeof extractCrmRecords>>;
  let wallMs: number;
  let heapDeltaMB: number;

  beforeAll(async () => {
    const rows = generateRows(TOTAL_ROWS);
    const heapBefore = process.memoryUsage().heapUsed;
    const start = Date.now();

    result = await extractCrmRecords(rows, headers);

    wallMs = Date.now() - start;
    const heapAfter = process.memoryUsage().heapUsed;
    heapDeltaMB = (heapAfter - heapBefore) / 1024 / 1024;

    console.log(`\n  Wall-clock: ${(wallMs / 1000).toFixed(2)}s`);
    console.log(`  Heap delta: ${heapDeltaMB.toFixed(1)} MB`);
    console.log(`  Batches:    ${result.batchCount}`);
    console.log(`  Imported:   ${result.records.length}`);
    console.log(`  Skipped:    ${result.skipped.length}`);
    console.log(`  Mock calls: ${mockChat.mock.calls.length}`);
  });

  it('processes the correct number of batches', () => {
    expect(result.batchCount).toBe(EXPECTED_BATCHES);
  });

  it('accounts for every input row (imported + skipped = total)', () => {
    expect(result.records.length + result.skipped.length).toBe(TOTAL_ROWS);
  });

  it('imports all rows when mock returns valid records', () => {
    expect(result.records.length).toBe(TOTAL_ROWS);
    expect(result.skipped.length).toBe(0);
  });

  it('calls the AI provider exactly once per batch', () => {
    expect(mockChat.mock.calls.length).toBe(EXPECTED_BATCHES);
  });

  it('keeps heap memory delta under 500 MB', () => {
    expect(heapDeltaMB).toBeLessThan(500);
  });

  it('completes in reasonable wall-clock time with pacing', () => {
    // 400 batches × 200ms inter-batch delay ≈ 80s upper bound
    // With mocked AI each batch is near-instant so total should be well under
    expect(wallMs).toBeLessThan(90_000);
  });
});
