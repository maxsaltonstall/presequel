import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = resolve(__dirname, '..', 'content', 'chapters', '11-catalog', 'data');
const LOGS_OUT  = resolve(OUT_DIR, 'logs.parquet');
const SPANS_OUT = resolve(OUT_DIR, 'spans.parquet');

const MIRROR_START_MS = Date.UTC(2026, 3, 26, 9, 0, 0); // 2026-04-26 09:00 UTC
const SYNC_START_MS   = Date.UTC(2026, 3, 1, 9, 0, 0);  // 2026-04-01 09:00 UTC (29 days earlier)
const PHANTOM  = 'chrono-portal-mirror';
const GHOST    = 'log-sync-svc';
const NORMAL_SVCS = ['auth-svc', 'api-gateway', 'chrono-archive', 'chrono-ledger', 'metrics-collector'];
const SPIKE_OFFSETS = [15, 33, 51, 69, 87, 105]; // minutes from MIRROR_START

const ERROR_MSGS = [
  'connection refused: downstream unreachable',
  'request timeout after 30000ms',
  'unexpected response code 403',
  'retry limit exceeded after 3 attempts',
  'parse error: unexpected token in response body',
  'socket hang up',
  'ECONNRESET: read timeout',
];
const INFO_MSGS     = ['request processed', 'cache hit', 'user authenticated', 'session refreshed', 'health check passed', 'metrics flushed', 'config reloaded'];
const WARN_MSGS     = ['high response latency', 'rate limit approaching', 'connection pool at 80%'];
const SVC_ERR_MSGS  = ['database connection pool exhausted', 'downstream dependency unavailable'];
const SYNC_INFO_MSGS = ['export job started', 'batch flushed', 'data synced', 'record written', 'queue drained'];
const SYNC_ERR_MSGS  = ['export target unreachable', 'write timeout after 5000ms'];

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
    const wStart = MIRROR_START_MS + off * 60_000;
    for (let i = 0; i < perWindow[wi]; i++) {
      rows.push({
        timestamp: fmtTs(wStart + i * Math.floor(60_000 / perWindow[wi])),
        message: ERROR_MSGS[i % ERROR_MSGS.length],
        tags: { service: PHANTOM, level: 'error', env: 'prod' },
      });
    }
  });
  return rows; // 80 rows
}

function ghostLogRows() {
  const rows = [];
  const DURATION_MS = 29 * 24 * 60 * 60_000; // 29 days
  for (let i = 0; i < 40; i++) {
    const ms  = SYNC_START_MS + Math.floor((i / 40) * DURATION_MS) + (i * 1_731) % 3_600_000;
    const lvl = i < 30 ? 'info' : 'error';
    const msg = lvl === 'info' ? SYNC_INFO_MSGS[i % SYNC_INFO_MSGS.length] : SYNC_ERR_MSGS[i % SYNC_ERR_MSGS.length];
    rows.push({ timestamp: fmtTs(ms), message: msg, tags: { service: GHOST, level: lvl, env: 'prod' } });
  }
  return rows; // 40 rows
}

function normalLogRows() {
  const rows = [];
  const DURATION = 180 * 60_000;
  NORMAL_SVCS.forEach((svc, si) => {
    for (let i = 0; i < 96; i++) {
      const ms  = MIRROR_START_MS + Math.floor((i / 96) * DURATION) + (si * 1000 + i * 37) % 30_000;
      const lvl = i < 80 ? 'info' : i < 90 ? 'warning' : 'error';
      const msg = lvl === 'info'    ? INFO_MSGS[i % INFO_MSGS.length]
                : lvl === 'warning' ? WARN_MSGS[i % WARN_MSGS.length]
                : SVC_ERR_MSGS[i % SVC_ERR_MSGS.length];
      rows.push({ timestamp: fmtTs(ms), message: msg, tags: { service: svc, level: lvl, env: 'prod' } });
    }
  });
  return rows; // 480 rows
}

function phantomSpanRows() {
  const rows = [];
  SPIKE_OFFSETS.forEach((off, wi) => {
    const wStart = MIRROR_START_MS + off * 60_000;
    const archiveCalls = wi === 0 ? 6 : 5; // 6+5+5+5+5+5 = 31
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
    for (let i = 0; i < 2; i++) { // 2×6 = 12
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
  return rows; // 43 rows
}

function ghostSpanRows() {
  const rows = [];
  const DURATION_MS = 29 * 24 * 60 * 60_000;
  for (let i = 0; i < 13; i++) {
    const ms = SYNC_START_MS + Math.floor((i / 13) * DURATION_MS) + (i * 2_113) % 3_600_000;
    rows.push({
      trace_id: `trace-lss-exp-${i}`,
      timestamp: fmtTs(ms),
      tags: { service: GHOST },
      operation: 'POST /export/batch',
      duration_ms: 800 + (i * 73) % 400,
      called_service: 'export-svc',
    });
  }
  for (let i = 0; i < 7; i++) {
    const ms = SYNC_START_MS + Math.floor((i / 7) * DURATION_MS) + (i * 3_007) % 3_600_000;
    rows.push({
      trace_id: `trace-lss-rpt-${i}`,
      timestamp: fmtTs(ms),
      tags: { service: GHOST },
      operation: 'GET /reports/query',
      duration_ms: 1200 + (i * 111) % 600,
      called_service: 'reporting-svc',
    });
  }
  return rows; // 20 rows
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
      const ms = MIRROR_START_MS + Math.floor((i / 50) * DURATION) + (pi * 5_000 + i * 113) % 60_000;
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
  return rows; // 250 rows
}

async function main() {
  const logRows  = [...phantomLogRows(), ...ghostLogRows(), ...normalLogRows()];
  const spanRows = [...phantomSpanRows(), ...ghostSpanRows(), ...normalSpanRows()];

  if (logRows.length !== 600)
    throw new Error(`Expected 600 log rows, got ${logRows.length}`);
  if (spanRows.length !== 313)
    throw new Error(`Expected 313 span rows, got ${spanRows.length}`);

  const phantomLogs = logRows.filter(r => r.tags.service === PHANTOM);
  if (phantomLogs.length !== 80)
    throw new Error(`Expected 80 phantom log rows, got ${phantomLogs.length}`);
  if (!phantomLogs.every(r => r.tags.level === 'error'))
    throw new Error('All phantom log rows must be level:error');

  const ghostLogs = logRows.filter(r => r.tags.service === GHOST);
  if (ghostLogs.length !== 40)
    throw new Error(`Expected 40 ghost log rows, got ${ghostLogs.length}`);

  const phantomSpans = spanRows.filter(r => r.tags.service === PHANTOM);
  if (phantomSpans.length !== 43)
    throw new Error(`Expected 43 phantom span rows, got ${phantomSpans.length}`);

  const ghostSpans = spanRows.filter(r => r.tags.service === GHOST);
  if (ghostSpans.length !== 20)
    throw new Error(`Expected 20 ghost span rows, got ${ghostSpans.length}`);

  const archiveCount = phantomSpans.filter(r => r.called_service === 'chrono-archive').length;
  const ledgerCount  = phantomSpans.filter(r => r.called_service === 'chrono-ledger').length;
  if (archiveCount !== 31) throw new Error(`Expected 31 archive spans, got ${archiveCount}`);
  if (ledgerCount  !== 12) throw new Error(`Expected 12 ledger spans, got ${ledgerCount}`);

  const exportCount  = ghostSpans.filter(r => r.called_service === 'export-svc').length;
  const reportCount  = ghostSpans.filter(r => r.called_service === 'reporting-svc').length;
  if (exportCount  !== 13) throw new Error(`Expected 13 export spans, got ${exportCount}`);
  if (reportCount  !== 7)  throw new Error(`Expected 7 reporting spans, got ${reportCount}`);

  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();

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
  console.log(`logs.parquet: ${logRows.length} rows → ${LOGS_OUT}`);

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
