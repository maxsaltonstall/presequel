import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dirname, '..', 'content', 'chapters', '08-when', 'data');
const OUT_PATH = resolve(OUT_DIR, 'logs.parquet');

const START_MS   = Date.UTC(2026, 3, 26, 8, 0, 0);   // 08:00:00 UTC
const SPIKE_MS   = Date.UTC(2026, 3, 26, 10, 55, 0); // 10:55:00 UTC
const END_MS     = Date.UTC(2026, 3, 26, 11, 0, 0);  // 11:00:00 UTC
const QUIET_SPAN = SPIKE_MS - START_MS;               // 10_500_000 ms
const SPIKE_SPAN = END_MS - SPIKE_MS;                 // 300_000 ms

const SERVICES_232 = [
  'api-gateway', 'auth-svc', 'cache-svc', 'db-replica', 'file-processor',
  'job-runner', 'mail-sender', 'metrics-collector', 'notification-svc', 'search-indexer',
];
const SERVICES_234 = ['billing-svc', 'analytics-worker'];
const ALL_SERVICES = [...SERVICES_232, ...SERVICES_234];
const PHANTOM_SVC  = 'chrono-portal-mirror';

const SPIKE_OFFSETS_MS = [132_000, 165_000, 203_000, 287_000];
const SPIKE_SECONDS    = new Set(SPIKE_OFFSETS_MS.map(o => Math.floor(o / 1000)));

const PHANTOM_MSGS = [
  'sync frame received',
  'transit lock confirmed',
  'mirror write ok',
  'handoff complete',
];

const ENVS    = ['prod', 'staging', 'dev'];
const REGIONS = ['us-central1', 'us-east1', 'eu-west1'];

function pick(arr, seed) { return arr[seed % arr.length]; }

function fmtTs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function generateRows() {
  const rows = [];
  let seed = 0;

  for (const svc of SERVICES_232) {
    const n = 232;
    for (let i = 0; i < n; i++) {
      const tsMs  = START_MS + Math.floor(i * QUIET_SPAN / n);
      const level = i % 25 === 0 ? 'error' : i % 8 === 0 ? 'warn' : 'info';
      rows.push({
        ts:      fmtTs(tsMs),
        message: `${svc} ${pick(ENVS, seed)} event`,
        service: svc,
        env:     pick(ENVS, seed + 3),
        level,
        region:  pick(REGIONS, seed + 7),
      });
      seed++;
    }
  }
  for (const svc of SERVICES_234) {
    const n = 234;
    for (let i = 0; i < n; i++) {
      const tsMs  = START_MS + Math.floor(i * QUIET_SPAN / n);
      const level = i % 25 === 0 ? 'error' : i % 8 === 0 ? 'warn' : 'info';
      rows.push({
        ts:      fmtTs(tsMs),
        message: `${svc} ${pick(ENVS, seed)} event`,
        service: svc,
        env:     pick(ENVS, seed + 3),
        level,
        region:  pick(REGIONS, seed + 7),
      });
      seed++;
    }
  }

  for (let k = 0; k < 180; k++) {
    let offset = Math.floor(k * SPIKE_SPAN / 180);
    if (SPIKE_SECONDS.has(Math.floor(offset / 1000))) offset += 1000;
    const tsMs = SPIKE_MS + offset;
    const svc  = ALL_SERVICES[k % ALL_SERVICES.length];
    rows.push({
      ts:      fmtTs(tsMs),
      message: `${svc} spike event ${k}`,
      service: svc,
      env:     pick(ENVS, k),
      level:   'info',
      region:  pick(REGIONS, k + 5),
    });
  }

  for (let si = 0; si < SPIKE_OFFSETS_MS.length; si++) {
    const tsMs = SPIKE_MS + SPIKE_OFFSETS_MS[si];
    for (let ei = 0; ei < 7; ei++) {
      const svc = ALL_SERVICES[ei % ALL_SERVICES.length];
      rows.push({
        ts:      fmtTs(tsMs),
        message: `${svc} error burst`,
        service: svc,
        env:     'prod',
        level:   'error',
        region:  pick(REGIONS, ei),
      });
    }
  }

  for (let pi = 0; pi < 4; pi++) {
    const tsMs = SPIKE_MS + SPIKE_OFFSETS_MS[pi];
    rows.push({
      ts:      fmtTs(tsMs),
      message: PHANTOM_MSGS[pi],
      service: PHANTOM_SVC,
      env:     'prod',
      level:   'info',
      region:  'us-central1',
    });
  }

  return rows;
}

async function main() {
  const rows = generateRows();

  if (rows.length !== 3000)
    throw new Error(`Expected 3000 rows, got ${rows.length}`);

  const phantomRows = rows.filter(r => r.service === PHANTOM_SVC);
  if (phantomRows.length !== 4)
    throw new Error(`Expected 4 phantom rows, got ${phantomRows.length}`);

  const SPIKE_START_STR = fmtTs(SPIKE_MS);
  const END_STR         = fmtTs(END_MS);
  if (!phantomRows.every(r => r.ts >= SPIKE_START_STR && r.ts < END_STR))
    throw new Error('Not all phantom rows fall in spike window');

  const spikeSecondTs = SPIKE_OFFSETS_MS.map(o => fmtTs(SPIKE_MS + o).slice(0, 19));
  const spikeSatisfied = spikeSecondTs.every(sts => {
    const errs = rows.filter(r => r.ts.slice(0, 19) === sts && r.level === 'error' && r.service !== PHANTOM_SVC);
    return errs.length >= 3;
  });
  if (!spikeSatisfied)
    throw new Error('At least one spike second does not have >= 3 errors from non-phantom services');

  const START_STR = fmtTs(START_MS);
  const outOfRange = rows.filter(r => r.ts < START_STR || r.ts >= END_STR);
  if (outOfRange.length > 0)
    throw new Error(`${outOfRange.length} rows fall outside [08:00:00, 11:00:00)`);

  const instance = await DuckDBInstance.create(':memory:');
  const conn     = await instance.connect();

  await conn.run(`
    CREATE TABLE logs (
      timestamp TIMESTAMP,
      message   VARCHAR,
      tags      MAP(VARCHAR, VARCHAR)
    )
  `);

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vals = batch.map(r =>
      `(TIMESTAMP ${sqlStr(r.ts)}, ${sqlStr(r.message)}, ` +
      `MAP(ARRAY['service','env','level','region'],` +
      `ARRAY[${sqlStr(r.service)},${sqlStr(r.env)},${sqlStr(r.level)},${sqlStr(r.region)}]))`
    ).join(',\n');
    await conn.run(`INSERT INTO logs VALUES\n${vals}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  await conn.run(`COPY logs TO ${sqlStr(OUT_PATH)} (FORMAT PARQUET)`);
  console.log(`Generated ${rows.length} rows → ${OUT_PATH}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
