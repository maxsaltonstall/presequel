import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dirname, '..', 'content', 'chapters', '07-static', 'data');
const OUT_PATH = resolve(OUT_DIR, 'logs.parquet');

const START_TS_MS = Date.UTC(2026, 3, 26, 8, 0, 0); // 2026-04-26 08:00:00 UTC
const HOUR_MS     = 3_600_000;
const TOTAL_ROWS  = 2000;

const HOSTS   = Array.from({ length: 40 }, (_, i) => `prn-host-${String(i + 1).padStart(3, '0')}`);
const REGIONS = ['us-central1', 'us-east1', 'eu-west1'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

const SERVICE_PATHS = {
  'auth-svc':          ['/v1/auth/login', '/v1/auth/logout', '/v1/auth/refresh', '/v1/auth/verify'],
  'api-gateway':       ['/api/v2/users', '/api/v2/items', '/api/v2/orders', '/api/v2/events'],
  'payment-svc':       ['/v1/pay/charge', '/v1/pay/refund', '/v1/pay/status', '/v1/pay/history'],
  'billing-svc':       ['/v1/billing/invoice', '/v1/billing/charge', '/v1/billing/plan', '/v1/billing/usage'],
  'notification-svc':  ['/v1/notify/send', '/v1/notify/status', '/v1/notify/unsubscribe', '/v1/notify/batch'],
  'user-profile':      ['/v1/profile/get', '/v1/profile/update', '/v1/profile/avatar', '/v1/profile/prefs'],
  'inventory-svc':     ['/v1/inv/list', '/v1/inv/reserve', '/v1/inv/release', '/v1/inv/count'],
  'search-svc':        ['/v1/search/query', '/v1/search/suggest', '/v1/search/reindex', '/v1/search/health'],
  'recommendation':    ['/v1/recs/user', '/v1/recs/item', '/v1/recs/trending', '/v1/recs/refresh'],
  'analytics-svc':     ['/v1/analytics/event', '/v1/analytics/pageview', '/v1/analytics/export', '/v1/analytics/query'],
  'metrics-collector': ['/v1/metrics/ingest', '/v1/metrics/query', '/v1/metrics/flush', '/v1/metrics/health'],
  'config-service':    ['/v1/config/get', '/v1/config/set', '/v1/config/reload', '/v1/config/validate'],
};

// Exact per-service, per-env, per-level segment counts.
// auth-svc is tuned so: total=150 (P02), prod=110 (P03), prod non-info=30 (P04).
// All other services: errors sum to 42; + auth-svc 5 + phantom 1 = 48 total (P05).
const SERVICE_DISTS = {
  'auth-svc': [
    { env: 'prod',    level: 'info',  count: 80 },
    { env: 'prod',    level: 'warn',  count: 25 },
    { env: 'prod',    level: 'error', count:  5 },
    { env: 'staging', level: 'info',  count: 25 },
    { env: 'staging', level: 'warn',  count:  5 },
    { env: 'dev',     level: 'info',  count: 10 },
  ],
  'api-gateway': [
    { env: 'prod',    level: 'info',  count: 77 },
    { env: 'prod',    level: 'warn',  count: 18 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 35 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 25 },
  ],
  'payment-svc': [
    { env: 'prod',    level: 'info',  count: 75 },
    { env: 'prod',    level: 'warn',  count: 17 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 34 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 24 },
  ],
  'billing-svc': [
    { env: 'prod',    level: 'info',  count: 80 },
    { env: 'prod',    level: 'warn',  count: 18 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 37 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 25 },
  ],
  'notification-svc': [
    { env: 'prod',    level: 'info',  count: 79 },
    { env: 'prod',    level: 'warn',  count: 18 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 36 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 25 },
  ],
  'user-profile': [
    { env: 'prod',    level: 'info',  count: 77 },
    { env: 'prod',    level: 'warn',  count: 18 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 35 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 25 },
  ],
  'inventory-svc': [
    { env: 'prod',    level: 'info',  count: 76 },
    { env: 'prod',    level: 'warn',  count: 17 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 35 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 24 },
  ],
  'search-svc': [
    { env: 'prod',    level: 'info',  count: 82 },
    { env: 'prod',    level: 'warn',  count: 19 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 37 },
    { env: 'staging', level: 'warn',  count:  7 },
    { env: 'dev',     level: 'info',  count: 26 },
  ],
  'recommendation': [
    { env: 'prod',    level: 'info',  count: 81 },
    { env: 'prod',    level: 'warn',  count: 18 },
    { env: 'prod',    level: 'error', count:  3 },
    { env: 'staging', level: 'info',  count: 37 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 25 },
  ],
  'analytics-svc': [
    { env: 'prod',    level: 'info',  count: 74 },
    { env: 'prod',    level: 'warn',  count: 17 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 34 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 23 },
  ],
  'metrics-collector': [
    { env: 'prod',    level: 'info',  count: 78 },
    { env: 'prod',    level: 'warn',  count: 18 },
    { env: 'prod',    level: 'error', count:  3 },
    { env: 'staging', level: 'info',  count: 35 },
    { env: 'staging', level: 'warn',  count:  6 },
    { env: 'dev',     level: 'info',  count: 25 },
  ],
  'config-service': [
    { env: 'prod',    level: 'info',  count: 88 },
    { env: 'prod',    level: 'warn',  count: 20 },
    { env: 'prod',    level: 'error', count:  4 },
    { env: 'staging', level: 'info',  count: 40 },
    { env: 'staging', level: 'warn',  count:  7 },
    { env: 'dev',     level: 'info',  count: 27 },
  ],
};

// 6 rows, fixed timestamps within the hour, exactly 1 error (for puzzle 05 to surface it).
const PHANTOM_ROWS = [
  { offsetSec:  180, message: 'portal handshake initiated',    level: 'info',  status: '200', host: 'prn-host-006', region: 'us-central1' },
  { offsetSec:  720, message: 'transit window aligned',         level: 'warn',  status: '202', host: 'prn-host-017', region: 'us-east1'    },
  { offsetSec: 1440, message: 'key exchange ok',                level: 'info',  status: '200', host: 'prn-host-006', region: 'us-central1' },
  { offsetSec: 2160, message: 'session context loaded',         level: 'info',  status: '200', host: 'prn-host-029', region: 'eu-west1'    },
  { offsetSec: 2880, message: 'tunnel endpoint registered',     level: 'warn',  status: '202', host: 'prn-host-017', region: 'us-east1'    },
  { offsetSec: 3420, message: 'unexpected mirror state: retry', level: 'error', status: '500', host: 'prn-host-006', region: 'us-central1' },
];

function makeMessage(service, globalIdx, level) {
  const paths = SERVICE_PATHS[service];
  const path   = paths[(globalIdx * 13) % paths.length];
  const method = METHODS[(globalIdx * 3) % METHODS.length];
  const ms     = 5 + (globalIdx * 7) % 200;
  const code   = level === 'error' ? '500' : level === 'warn' ? '429' : '200';
  return level === 'error'
    ? `${method} ${path} ${code} timeout after ${ms}ms`
    : `${method} ${path} ${code} ${ms}ms`;
}

function fmtTs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function generateRows() {
  const rows = [];
  let globalIdx = 0;
  for (const [service, segments] of Object.entries(SERVICE_DISTS)) {
    for (const seg of segments) {
      for (let i = 0; i < seg.count; i++) {
        const tsMs   = START_TS_MS + Math.floor((globalIdx * HOUR_MS) / TOTAL_ROWS);
        const host   = HOSTS[(globalIdx * 7) % HOSTS.length];
        const region = REGIONS[(globalIdx * 11) % REGIONS.length];
        const status = seg.level === 'error' ? '500' : seg.level === 'warn' ? '429' : '200';
        rows.push({
          ts: fmtTs(tsMs),
          message: makeMessage(service, globalIdx, seg.level),
          service, env: seg.env, host, level: seg.level, status, region,
        });
        globalIdx++;
      }
    }
  }
  for (const p of PHANTOM_ROWS) {
    rows.push({
      ts: fmtTs(START_TS_MS + p.offsetSec * 1000),
      message: p.message,
      service: 'chrono-portal-mirror',
      env: 'prod', host: p.host, level: p.level, status: p.status, region: p.region,
    });
  }
  return rows;
}

async function main() {
  const rows = generateRows();

  if (rows.length !== 2000)
    throw new Error(`Expected 2000 rows, got ${rows.length}`);
  const phantom = rows.filter(r => r.service === 'chrono-portal-mirror');
  if (phantom.length !== 6)
    throw new Error(`Expected 6 phantom rows, got ${phantom.length}`);
  if (!phantom.some(r => r.level === 'error'))
    throw new Error('Phantom must have at least one error row');
  const errorCount = rows.filter(r => r.level === 'error').length;
  if (errorCount !== 48)
    throw new Error(`Expected 48 error rows, got ${errorCount}`);
  const START_STR = fmtTs(START_TS_MS);
  const END_STR   = fmtTs(START_TS_MS + HOUR_MS);
  const outOfHour = rows.filter(r => r.ts < START_STR || r.ts > END_STR);
  if (outOfHour.length > 0)
    throw new Error(`${outOfHour.length} rows fall outside the 1-hour window`);

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
      `MAP(ARRAY['service','env','host','level','status','region'],` +
      `ARRAY[${sqlStr(r.service)},${sqlStr(r.env)},${sqlStr(r.host)},` +
      `${sqlStr(r.level)},${sqlStr(r.status)},${sqlStr(r.region)}]))`
    ).join(',\n');
    await conn.run(`INSERT INTO logs VALUES\n${vals}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  await conn.run(`COPY logs TO ${sqlStr(OUT_PATH)} (FORMAT PARQUET)`);
  console.log(`Generated 2000 rows → ${OUT_PATH}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
