import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dirname, '..', 'content', 'chapters', '09-heat', 'data');
const OUT_PATH = resolve(OUT_DIR, 'metrics.parquet');

const START_MS = Date.UTC(2026, 3, 26, 10, 0, 0); // 2026-04-26 10:00:00 UTC
const MINUTES  = 120;

const QUIET_SERVICES = ['auth-svc', 'api-gateway', 'payment-svc', 'billing-svc', 'notification-svc'];
const PHANTOM_SVC    = 'chrono-portal-mirror';
const ALL_SERVICES   = [...QUIET_SERVICES, PHANTOM_SVC];

const SPIKE_OFFSETS = new Set([15, 33, 51, 69, 87, 105]);

function minuteOffset(minuteStr) {
  return (new Date(minuteStr.replace(' ', 'T') + 'Z').getTime() - START_MS) / 60_000;
}

function fmtMinute(m) {
  return new Date(START_MS + m * 60_000).toISOString()
    .replace('T', ' ').replace('Z', '').slice(0, 19);
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function getN(service, m) {
  if (service === PHANTOM_SVC && SPIKE_OFFSETS.has(m)) {
    return 150 + (m * 7 + service.length) % 51; // 150–200
  }
  if (service === PHANTOM_SVC) {
    return 2 + (m * 3 + 5) % 4; // 2–5
  }
  return 10 + (m * 11 + service.length * 7) % 21; // 10–30
}

function getErrors(service, m) {
  if (service === PHANTOM_SVC && SPIKE_OFFSETS.has(m)) {
    return 20 + (m * 5 + service.length) % 11; // 20–30
  }
  if (service === PHANTOM_SVC) return 0;
  return (m * 3 + service.length) % 3; // 0–2
}

function generateRows() {
  const rows = [];
  for (const service of ALL_SERVICES) {
    for (let m = 0; m < MINUTES; m++) {
      rows.push({ minute: fmtMinute(m), service, n: getN(service, m), errors: getErrors(service, m) });
    }
  }
  return rows;
}

async function main() {
  const rows = generateRows();

  if (rows.length !== 720)
    throw new Error(`Expected 720 rows, got ${rows.length}`);

  const phantomRows = rows.filter(r => r.service === PHANTOM_SVC);
  const spikeRows   = phantomRows.filter(r => SPIKE_OFFSETS.has(minuteOffset(r.minute)));
  if (spikeRows.length !== 6)
    throw new Error(`Expected 6 spike rows, got ${spikeRows.length}`);
  if (!spikeRows.every(r => r.n > 60))
    throw new Error('All spike rows must have n > 60');

  const quietPhantom = phantomRows.filter(r => !SPIKE_OFFSETS.has(minuteOffset(r.minute)));
  if (!quietPhantom.every(r => r.n <= 60))
    throw new Error('All non-spike phantom rows must have n <= 60');

  const START_STR = fmtMinute(0);
  const END_STR   = fmtMinute(MINUTES - 1);
  if (rows.some(r => r.minute < START_STR || r.minute > END_STR))
    throw new Error('Some rows fall outside the time window');

  const instance = await DuckDBInstance.create(':memory:');
  const conn     = await instance.connect();

  await conn.run(`
    CREATE TABLE metrics (
      minute  TIMESTAMP,
      service VARCHAR,
      n       INTEGER,
      errors  INTEGER
    )
  `);

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vals  = batch.map(r =>
      `(TIMESTAMP ${sqlStr(r.minute)}, ${sqlStr(r.service)}, ${r.n}, ${r.errors})`
    ).join(',\n');
    await conn.run(`INSERT INTO metrics VALUES\n${vals}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  await conn.run(`COPY metrics TO ${sqlStr(OUT_PATH)} (FORMAT PARQUET)`);
  console.log(`Generated 720 rows → ${OUT_PATH}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
