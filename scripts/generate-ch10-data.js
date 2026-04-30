import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = resolve(__dirname, '..', 'content', 'chapters', '10-reach', 'data');
const LOGS_OUT  = resolve(OUT_DIR, 'logs.parquet');
const SPANS_OUT = resolve(OUT_DIR, 'spans.parquet');

const START_MS = Date.UTC(2026, 3, 26, 9, 0, 0); // 2026-04-26 09:00 UTC
const PHANTOM  = 'chrono-portal-mirror';
const NORMAL_SVCS  = ['auth-svc', 'api-gateway', 'chrono-archive', 'chrono-ledger', 'metrics-collector'];
const SPIKE_OFFSETS = [15, 33, 51, 69, 87, 105]; // minutes from START

const ERROR_MSGS = [
  'connection refused: downstream unreachable',
  'request timeout after 30000ms',
  'unexpected response code 403',
  'retry limit exceeded after 3 attempts',
  'parse error: unexpected token in response body',
  'socket hang up',
  'ECONNRESET: read timeout',
];
const INFO_MSGS  = ['request processed', 'cache hit', 'user authenticated', 'session refreshed', 'health check passed', 'metrics flushed', 'config reloaded'];
const WARN_MSGS  = ['high response latency', 'rate limit approaching', 'connection pool at 80%'];
const SVC_ERR_MSGS = ['database connection pool exhausted', 'downstream dependency unavailable'];

function fmtTs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function mapExpr(obj) {
  const pairs = Object.entries(obj)
    .map(([k, v]) => `(${sqlStr(k)}, ${sqlStr(v)})`)
    .join(', ');
  return `map_from_entries([${pairs}])`;
}

function phantomLogRows() {
  const rows = [];
  const perWindow = [14, 14, 13, 13, 13, 13]; // 80 total
  SPIKE_OFFSETS.forEach((off, wi) => {
    const wStart = START_MS + off * 60_000;
    for (let i = 0; i < perWindow[wi]; i++) {
      rows.push({
        timestamp: fmtTs(wStart + i * Math.floor(60_000 / perWindow[wi])),
        message: ERROR_MSGS[i % ERROR_MSGS.length],
        tags: { service: PHANTOM, level: 'error', env: 'prod' },
      });
    }
  });
  return rows;
}

function normalLogRows() {
  const rows = [];
  const DURATION = 180 * 60_000;
  NORMAL_SVCS.forEach((svc, si) => {
    for (let i = 0; i < 84; i++) {
      const ms  = START_MS + Math.floor((i / 84) * DURATION) + (si * 1000 + i * 37) % 30_000;
      const lvl = i < 70 ? 'info' : i < 80 ? 'warning' : 'error';
      const msg = lvl === 'info'    ? INFO_MSGS[i % INFO_MSGS.length]
                : lvl === 'warning' ? WARN_MSGS[i % WARN_MSGS.length]
                : SVC_ERR_MSGS[i % SVC_ERR_MSGS.length];
      rows.push({ timestamp: fmtTs(ms), message: msg, tags: { service: svc, level: lvl, env: 'prod' } });
    }
  });
  return rows;
}

function phantomSpanRows() {
  const rows = [];
  SPIKE_OFFSETS.forEach((off, wi) => {
    const wStart = START_MS + off * 60_000;
    const archiveCalls = wi === 0 ? 6 : 5;
    for (let i = 0; i < archiveCalls; i++) {
      rows.push({
        trace_id: `trace-cpm-arc-${wi}-${i}`,
        timestamp: fmtTs(wStart + i * 8_000),
        tags: { service: PHANTOM },
        operation: 'GET /archive/founding/search',
        duration_ms: 4200 + (i * 137 + wi * 43) % 800,
        called_service: 'chrono-archive',
      });
    }
    for (let i = 0; i < 2; i++) {
      rows.push({
        trace_id: `trace-cpm-ldg-${wi}-${i}`,
        timestamp: fmtTs(wStart + 15_000 + i * 12_000),
        tags: { service: PHANTOM },
        operation: 'GET /ledger/engagements/query',
        duration_ms: 6100 + (i * 211 + wi * 77) % 900,
        called_service: 'chrono-ledger',
      });
    }
  });
  return rows;
}

const SPAN_PAIRS = [
  ['auth-svc',          'api-gateway',     'POST /api/v1/auth',       120, 250],
  ['api-gateway',       'chrono-archive',  'GET /archive/search',      80, 180],
  ['api-gateway',       'chrono-ledger',   'GET /ledger/query',         90, 200],
  ['metrics-collector', 'api-gateway',     'POST /api/v1/metrics',      50, 110],
  ['chrono-archive',    'chrono-ledger',   'GET /ledger/verify',         70, 160],
];

function normalSpanRows() {
  const rows = [];
  const DURATION = 180 * 60_000;
  SPAN_PAIRS.forEach(([caller, callee, op, lo, hi], pi) => {
    for (let i = 0; i < 50; i++) {
      const ms = START_MS + Math.floor((i / 50) * DURATION) + (pi * 5_000 + i * 113) % 60_000;
      rows.push({
        trace_id: `trace-${caller.slice(0, 4)}-${String(pi * 50 + i).padStart(4, '0')}`,
        timestamp: fmtTs(ms),
        tags: { service: caller },
        operation: op,
        duration_ms: lo + (i * 17 + pi * 31) % (hi - lo),
        called_service: callee,
      });
    }
  });
  return rows;
}

async function main() {
  const logRows  = [...phantomLogRows(), ...normalLogRows()];
  const spanRows = [...phantomSpanRows(), ...normalSpanRows()];

  // Sanity checks
  if (logRows.length !== 500)
    throw new Error(`Expected 500 log rows, got ${logRows.length}`);
  const phantomLogs = logRows.filter(r => r.tags.service === PHANTOM);
  if (phantomLogs.length !== 80)
    throw new Error(`Expected 80 phantom log rows, got ${phantomLogs.length}`);
  if (!phantomLogs.every(r => r.tags.level === 'error'))
    throw new Error('All phantom log rows must be level:error');
  const phantomSpans = spanRows.filter(r => r.tags.service === PHANTOM);
  if (phantomSpans.length !== 43)
    throw new Error(`Expected 43 phantom span rows, got ${phantomSpans.length}`);
  const archiveCount = phantomSpans.filter(r => r.called_service === 'chrono-archive').length;
  const ledgerCount  = phantomSpans.filter(r => r.called_service === 'chrono-ledger').length;
  if (archiveCount !== 31) throw new Error(`Expected 31 archive spans, got ${archiveCount}`);
  if (ledgerCount  !== 12) throw new Error(`Expected 12 ledger spans, got ${ledgerCount}`);
  if (spanRows.length !== 293)
    throw new Error(`Expected 293 span rows, got ${spanRows.length}`);

  const instance = await DuckDBInstance.create(':memory:');
  const conn     = await instance.connect();

  // Write logs parquet
  await conn.run(`
    CREATE TABLE logs (
      timestamp TIMESTAMP,
      message   VARCHAR,
      tags      MAP(VARCHAR, VARCHAR)
    )
  `);
  const BATCH = 100;
  for (let i = 0; i < logRows.length; i += BATCH) {
    const vals = logRows.slice(i, i + BATCH).map(r =>
      `(TIMESTAMP ${sqlStr(r.timestamp)}, ${sqlStr(r.message)}, ${mapExpr(r.tags)})`
    ).join(',\n');
    await conn.run(`INSERT INTO logs VALUES\n${vals}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  await conn.run(`COPY logs TO ${sqlStr(LOGS_OUT)} (FORMAT PARQUET)`);
  console.log(`logs.parquet: 500 rows → ${LOGS_OUT}`);

  // Write spans parquet
  await conn.run(`DROP TABLE logs`);
  await conn.run(`
    CREATE TABLE spans (
      trace_id       VARCHAR,
      timestamp      TIMESTAMP,
      tags           MAP(VARCHAR, VARCHAR),
      operation      VARCHAR,
      duration_ms    INTEGER,
      called_service VARCHAR
    )
  `);
  for (let i = 0; i < spanRows.length; i += BATCH) {
    const vals = spanRows.slice(i, i + BATCH).map(r =>
      `(${sqlStr(r.trace_id)}, TIMESTAMP ${sqlStr(r.timestamp)}, ${mapExpr(r.tags)}, ${sqlStr(r.operation)}, ${r.duration_ms}, ${sqlStr(r.called_service)})`
    ).join(',\n');
    await conn.run(`INSERT INTO spans VALUES\n${vals}`);
  }
  await conn.run(`COPY spans TO ${sqlStr(SPANS_OUT)} (FORMAT PARQUET)`);
  console.log(`spans.parquet: ${spanRows.length} rows → ${SPANS_OUT}`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
