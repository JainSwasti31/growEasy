/**
 * Test the /api/csv/import/stream NDJSON endpoint.
 * Sends the basic.csv and prints each event as it arrives.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../test-samples/basic.csv');
const boundary = '----StreamTestBoundary' + Date.now();
const filename = 'basic.csv';
const fileData = fs.readFileSync(filePath);

const header = Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`
);
const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([header, fileData, footer]);

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/csv/import/stream',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
};

console.log('\n══ Streaming import test ══\n');

const req = http.request(options, (res) => {
  console.log(`HTTP ${res.statusCode} ${res.statusMessage}`);
  console.log(`Content-Type: ${res.headers['content-type']}\n`);

  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const event = JSON.parse(t);
        const label = event.type.toUpperCase().padEnd(6);
        if (event.type === 'start') {
          console.log(`[${label}] totalRows=${event.totalRows}, totalBatches=${event.totalBatches}`);
        } else if (event.type === 'batch') {
          console.log(`[${label}] batch=${event.batchIndex + 1}/${event.totalBatches}, imported=${event.runningImported}, skipped=${event.runningSkipped}`);
        } else if (event.type === 'done') {
          console.log(`[${label}] totalImported=${event.totalImported}, totalSkipped=${event.totalSkipped}`);
          console.log(`\n✅ Stream completed successfully\n`);
        } else if (event.type === 'error') {
          console.log(`[${label}] ${event.message}`);
          console.log(`\n❌ Stream ended with error\n`);
        }
      } catch {
        console.log('  [raw]', t.slice(0, 120));
      }
    }
  });

  res.on('end', () => {
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        console.log(`[${event.type?.toUpperCase()}] (final)`, JSON.stringify(event).slice(0, 80));
      } catch { /* ignore */ }
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(body);
req.end();
