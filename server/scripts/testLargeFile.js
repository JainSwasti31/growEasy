/**
 * A3 large-file stress test — pure Node.js, no extra deps.
 *
 * Generates a 10,000-row synthetic CSV, runs it through the full
 * extraction pipeline with a MOCKED provider (no real AI calls),
 * and reports:
 * - Wall-clock time
 * - Peak heap memory delta
 * - No unhandled rejections
 * - Correct batch count (10000 / 25 = 400 batches)
 * - All rows accounted for (imported + skipped = 10000)
 *
 * Run: node scripts/testLargeFile.js
 */

// ── Register TypeScript paths so @groweasy/shared resolves correctly ──────────
require('tsconfig-paths/register');

const { register } = require('ts-node');
register({
  project: require('path').join(__dirname, '../tsconfig.json'),
  transpileOnly: true,
});

// ── Load dotenv so process.env is populated ───────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// ── Now load the TypeScript modules ───────────────────────────────────────────
const { extractCrmRecords } = require('../src/services/aiExtractor');
const { createAiProvider } = require('../src/services/aiProviders');

// Monkey-patch createAiProvider to return a fast mock
const aiProviders = require('../src/services/aiProviders');
const originalCreate = aiProviders.createAiProvider;
aiProviders.createAiProvider = function () {
  return {
    name: 'mock',
    async chat(_systemPrompt, userMessage) {
      // Parse the batch size from the user message so the mock responds correctly
      const match = userMessage.match(/(\d+) CSV rows/);
      const batchSize = match ? parseInt(match[1], 10) : 25;

      const records = [];
      for (let i = 0; i < batchSize; i++) {
        records.push({
          sourceRowIndex: i,
          name: `Lead ${i}`,
          email: `lead${i}@example.com`,
          mobile_without_country_code: `98765${String(i).padStart(5, '0')}`,
        });
      }
      return JSON.stringify({ records, skipped: [] });
    },
  };
};

// ── Generate 10,000 synthetic rows ───────────────────────────────────────────
const TOTAL_ROWS = 10_000;

function generateRows(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      'Full Name': `Lead ${i}`,
      Email: `lead${i}@example.com`,
      Phone: `+91 98765${String(i).padStart(5, '0')}`,
      Company: `Company ${i % 100}`,
      City: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai'][i % 4],
      Remarks: `Remark for row ${i}`,
    });
  }
  return rows;
}

const headers = ['Full Name', 'Email', 'Phone', 'Company', 'City', 'Remarks'];

// ── Run the test ──────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n══ A3 Large-file stress test (${TOTAL_ROWS.toLocaleString()} rows) ══\n`);

  const rows = generateRows(TOTAL_ROWS);
  const heapBefore = process.memoryUsage().heapUsed;
  const start = Date.now();

  let result;
  try {
    result = await extractCrmRecords(rows, headers);
  } catch (err) {
    console.error('❌ extractCrmRecords threw:', err);
    process.exit(1);
  }

  const wallMs = Date.now() - start;
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDeltaMB = ((heapAfter - heapBefore) / 1024 / 1024).toFixed(1);

  const EXPECTED_BATCHES = Math.ceil(TOTAL_ROWS / 25);
  const totalAccounted = result.records.length + result.skipped.length;

  console.log(`\n── Results ──────────────────────────────────`);
  console.log(`  Wall-clock time : ${(wallMs / 1000).toFixed(2)}s`);
  console.log(`  Heap delta      : ${heapDeltaMB} MB`);
  console.log(`  Batches         : ${result.batchCount} (expected ${EXPECTED_BATCHES})`);
  console.log(`  Imported        : ${result.records.length}`);
  console.log(`  Skipped         : ${result.skipped.length}`);
  console.log(`  Total accounted : ${totalAccounted} / ${TOTAL_ROWS}`);

  const batchOk = result.batchCount === EXPECTED_BATCHES;
  const accountingOk = totalAccounted === TOTAL_ROWS;
  const memOk = parseFloat(heapDeltaMB) < 500; // < 500 MB delta is healthy

  console.log(`\n── Assertions ───────────────────────────────`);
  console.log(`  Batch count correct    : ${batchOk ? '✓' : '✗ FAIL'}`);
  console.log(`  All rows accounted for : ${accountingOk ? '✓' : '✗ FAIL'}`);
  console.log(`  Memory delta < 500 MB  : ${memOk ? '✓' : '✗ FAIL'} (${heapDeltaMB} MB)`);

  if (batchOk && accountingOk && memOk) {
    console.log('\n✅ All assertions passed\n');
  } else {
    console.log('\n❌ Some assertions failed\n');
    process.exit(1);
  }
}

// Catch any unhandled rejections — if any fire, the test fails
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

run();
