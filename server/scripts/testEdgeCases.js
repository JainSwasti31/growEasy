/**
 * Phase 6 edge case tests — pure Node.js, no extra deps.
 * Run with: node scripts/testEdgeCases.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4000';
const SAMPLES = path.join(__dirname, '../test-samples');

// ── Minimal multipart/form-data builder ───────────────────────────────────────

function buildMultipart(filePath, contentType) {
  const boundary = '----GrowEasyBoundary' + Date.now();
  const filename = path.basename(filePath);
  const fileData = filePath ? fs.readFileSync(filePath) : Buffer.alloc(0);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileData, footer]);

  return { boundary, body };
}

function post(urlPath, body, contentType) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length,
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

async function testParse(label, filePath, mimeType = 'text/csv') {
  const { boundary, body } = buildMultipart(filePath, mimeType);
  const { status, body: resp } = await post(
    '/api/csv/parse',
    body,
    `multipart/form-data; boundary=${boundary}`
  );
  // Parse JSON for cleaner display
  let display;
  try {
    const parsed = JSON.parse(resp);
    if (parsed.error) display = `ERROR: ${parsed.error}`;
    else display = `OK — ${parsed.totalRows} rows, headers: [${parsed.headers?.join(', ')}]`;
  } catch {
    display = resp.slice(0, 120);
  }
  const marker = status >= 200 && status < 300 ? '✓' : status >= 400 ? '✗' : '?';
  console.log(`${marker} ${label.padEnd(30)} HTTP ${status}  ${display}`);
}

async function testNoFile(label) {
  const boundary = '----GrowEasyEmpty' + Date.now();
  const body = Buffer.from(`--${boundary}--\r\n`);
  const { status, body: resp } = await post(
    '/api/csv/parse',
    body,
    `multipart/form-data; boundary=${boundary}`
  );
  let display;
  try { display = `ERROR: ${JSON.parse(resp).error}`; } catch { display = resp.slice(0, 80); }
  console.log(`✗ ${label.padEnd(30)} HTTP ${status}  ${display}`);
}

async function run() {
  console.log('\n══ Phase 6 edge case tests ══\n');

  // 1–5: CSV parser edge cases
  await testParse('1. Empty file',          path.join(SAMPLES, 'empty.csv'));
  await testParse('2. Headers only',        path.join(SAMPLES, 'headers-only.csv'));
  await testParse('3. Single column',       path.join(SAMPLES, 'single-col.csv'));
  await testParse('4. Ragged CSV',          path.join(SAMPLES, 'ragged.csv'));
  await testParse('5. Duplicate headers',   path.join(SAMPLES, 'duplicate-headers.csv'));
  await testParse('6. Semicolon delimited', path.join(SAMPLES, 'semicolon-delimited.csv'));
  await testParse('7. Basic comma CSV',     path.join(SAMPLES, 'basic.csv'));

  // 8: Non-CSV rejected
  const mdFile = path.join(__dirname, '../../README.md');
  await testParse('8. Non-CSV (md) → 415', mdFile, 'text/plain');

  // 9: No file uploaded
  await testNoFile('9. No file → 400');

  console.log('\n══ Done ══\n');
}

run().catch(console.error);
