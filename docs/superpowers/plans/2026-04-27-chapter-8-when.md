# Chapter 8 — "When" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chapter 8 ("When"), teaching DDSQL `@timestamp` time-window filters and `bucket(field, interval)` grouping shorthand via a 6-puzzle investigation of coordinated phantom log timestamps.

**Architecture:** Add two pure translator stages (`translateTimeWindow`, `translateBucket`) to `server/ddsql.js` and wire them into `server.js`. Generate a 3000-row parquet dataset for 10:55–11:00 spike analysis. Create 6 puzzle JSONs, a chapter.json, seed.sql, and a reference doc. Register the chapter in `src/main.js` and `src/reference.js`.

**Tech Stack:** Node.js ESM, `node:test`, DuckDB via `@duckdb/node-api`, Playwright for E2E.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `server/ddsql.js` | Add `translateTimeWindow` and `translateBucket` exports |
| Modify | `server.js` | Wire two new stages into translate pipeline |
| Create | `tests/ddsql-time-window.test.js` | 12 unit tests for both new translator stages |
| Create | `scripts/generate-ch8-logs.js` | Deterministic 3000-row parquet generator |
| Create | `content/chapters/08-when/data/logs.parquet` | Generated, committed |
| Create | `content/chapters/08-when/seed.sql` | Sets `ch8_anchor`, loads parquet |
| Create | `content/chapters/08-when/chapter.json` | Chapter metadata and narrative |
| Create | `content/chapters/08-when/puzzles/01.json`–`06.json` | 6 puzzle definitions |
| Create | `content/reference/time-windows.md` | Reference doc for `@timestamp` and `bucket()` |
| Modify | `src/main.js` | Append `'08-when'` to `CHAPTER_ORDER` |
| Modify | `src/reference.js` | Add `'08-when'` entry to `CONCEPTS_FOR_CHAPTER` |
| Modify | `tests/e2e-smoke.spec.js` | Append Chapter 8 Puzzle 01 walkthrough |
| Modify | `docs/playtest-checklist.md` | Append Chapter 8 manual test section |

---

## Task 1: DDSQL Time-Window and Bucket Translator

**Files:**
- Create: `tests/ddsql-time-window.test.js`
- Modify: `server/ddsql.js`

- [ ] **Step 1: Write the failing test file**

Create `tests/ddsql-time-window.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateTimeWindow, translateBucket } from '../server/ddsql.js';

// translateTimeWindow — basic cases
test('now-1h to now → 1-hour interval', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-1h to now]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hours' AND timestamp <= getvariable('ch8_anchor')"
  );
});

test('now-3h to now → 3-hour interval', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-3h to now]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '3 hours' AND timestamp <= getvariable('ch8_anchor')"
  );
});

test('now-2h to now-1h → both bounds translated', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-2h to now-1h]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '2 hours' AND timestamp <= getvariable('ch8_anchor') - INTERVAL '1 hours'"
  );
});

test('now-5m to now → minutes unit', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-5m to now]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '5 minutes' AND timestamp <= getvariable('ch8_anchor')"
  );
});

// translateTimeWindow — pass-through
test('pass-through: no @timestamp in SQL → unchanged', () => {
  const sql = "SELECT * FROM logs WHERE tags['level'] = 'error'";
  assert.equal(translateTimeWindow(sql), sql);
});

test('pass-through: @timestamp with unrecognised bracket content → unchanged', () => {
  const sql = "SELECT * FROM logs WHERE @timestamp:[yesterday to today]";
  assert.equal(translateTimeWindow(sql), sql);
});

// translateBucket — basic cases
test('bucket(timestamp, 1m) → DATE_TRUNC minute', () => {
  assert.equal(
    translateBucket("SELECT bucket(timestamp, 1m) AS minute FROM logs"),
    "SELECT DATE_TRUNC('minute', timestamp) AS minute FROM logs"
  );
});

test('bucket(timestamp, 1h) → DATE_TRUNC hour', () => {
  assert.equal(
    translateBucket("SELECT bucket(timestamp, 1h) AS hour FROM logs"),
    "SELECT DATE_TRUNC('hour', timestamp) AS hour FROM logs"
  );
});

test('bucket(timestamp, 1s) → DATE_TRUNC second', () => {
  assert.equal(
    translateBucket("SELECT bucket(timestamp, 1s) AS second FROM logs"),
    "SELECT DATE_TRUNC('second', timestamp) AS second FROM logs"
  );
});

test('bucket in GROUP BY position → rewritten', () => {
  assert.equal(
    translateBucket("SELECT bucket(ts, 1m), COUNT(*) FROM logs GROUP BY bucket(ts, 1m)"),
    "SELECT DATE_TRUNC('minute', ts), COUNT(*) FROM logs GROUP BY DATE_TRUNC('minute', ts)"
  );
});

test('pass-through: bucket with unrecognised interval → unchanged', () => {
  const sql = "SELECT bucket(timestamp, 5m) FROM logs";
  assert.equal(translateBucket(sql), sql);
});

// Composition
test('composition: @timestamp and bucket both rewritten correctly', () => {
  const input = "SELECT bucket(timestamp, 1m) AS minute, COUNT(*) AS n FROM logs WHERE @timestamp:[now-1h to now] GROUP BY minute ORDER BY minute";
  const expected = "SELECT DATE_TRUNC('minute', timestamp) AS minute, COUNT(*) AS n FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hours' AND timestamp <= getvariable('ch8_anchor') GROUP BY minute ORDER BY minute";
  assert.equal(translateBucket(translateTimeWindow(input)), expected);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
node --test tests/ddsql-time-window.test.js
```

Expected: All 12 tests fail with `TypeError: translateTimeWindow is not a function` (named exports don't exist yet).

- [ ] **Step 3: Add `translateTimeWindow` and `translateBucket` to `server/ddsql.js`**

Append to the end of `server/ddsql.js` (after the existing `translateTagFilter` export):

```js
function translateBound(b) {
  const lower = b.toLowerCase();
  if (lower === 'now') return "getvariable('ch8_anchor')";
  const m = lower.match(/^now-(\d+)(h|m|s)$/);
  if (!m) return null;
  const [, n, unit] = m;
  const units = { h: 'hours', m: 'minutes', s: 'seconds' };
  return `getvariable('ch8_anchor') - INTERVAL '${n} ${units[unit]}'`;
}

export function translateTimeWindow(sql) {
  return sql.replace(/@timestamp:\[([^\]]+)\]/gi, (match, inner) => {
    const parts = inner.split(/\s+to\s+/i);
    if (parts.length !== 2) return match;
    const lo = translateBound(parts[0].trim());
    const hi = translateBound(parts[1].trim());
    if (!lo || !hi) return match;
    return `timestamp >= ${lo} AND timestamp <= ${hi}`;
  });
}

const BUCKET_UNITS = { '1s': 'second', '1m': 'minute', '1h': 'hour' };

export function translateBucket(sql) {
  return sql.replace(/\bbucket\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/gi, (match, field, interval) => {
    const unit = BUCKET_UNITS[interval.toLowerCase()];
    if (!unit) return match;
    return `DATE_TRUNC('${unit}', ${field})`;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
node --test tests/ddsql-time-window.test.js
```

Expected: All 12 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```
npm test
```

Expected: All tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add tests/ddsql-time-window.test.js server/ddsql.js
git commit -m "feat(ddsql): add translateTimeWindow and translateBucket stages"
```

---

## Task 2: Wire New Translator Stages into server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update the import line in `server.js`**

At line 6, change:

```js
import { translateTagFilter } from './server/ddsql.js';
```

to:

```js
import { translateTagFilter, translateTimeWindow, translateBucket } from './server/ddsql.js';
```

- [ ] **Step 2: Update the pipeline at line 123 in `server.js`**

Change:

```js
const translated = translateTagFilter(sql);
```

to:

```js
const translated = translateBucket(translateTimeWindow(translateTagFilter(sql)));
```

- [ ] **Step 3: Verify the full test suite still passes**

```
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Manual smoke check**

Start the server (`node server.js`) and in a browser console:

```js
fetch('/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chapter: '07-static', sql: 'SELECT * FROM logs WHERE service:auth-svc LIMIT 5' })
}).then(r => r.json()).then(console.log)
```

Expected: `{ columns: [...], rows: [...] }` with 5 rows, no errors.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(server): pipe translateTimeWindow and translateBucket into query pipeline"
```

---

## Task 3: Generate Chapter 8 Parquet Data

**Files:**
- Create: `scripts/generate-ch8-logs.js`
- Create: `content/chapters/08-when/data/logs.parquet`

**Distribution:**
- 3000 rows total
- Quiet period (08:00–10:55, 10500s): 12 services × varying counts = 2788 rows
  - 10 services × 232 rows: api-gateway, auth-svc, cache-svc, db-replica, file-processor, job-runner, mail-sender, metrics-collector, notification-svc, search-indexer
  - 2 services × 234 rows: billing-svc, analytics-worker
- Spike period (10:55–11:00, 300s): 12 services × 15 rows = 180 rows (not on spike seconds)
- Spike-second errors: 4 seconds × 7 errors = 28 rows
- Phantom rows: 4 rows (chrono-portal-mirror, one per spike second)
- Spike second offsets from 10:55:00: 132s (10:57:12), 165s (10:57:45), 203s (10:58:23), 287s (10:59:47)

- [ ] **Step 1: Create `scripts/generate-ch8-logs.js`**

```js
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

// Spike second offsets from SPIKE_MS (ms): 10:57:12, 10:57:45, 10:58:23, 10:59:47
const SPIKE_OFFSETS_MS = [132_000, 165_000, 203_000, 287_000];
const SPIKE_SECONDS    = new Set(SPIKE_OFFSETS_MS.map(o => Math.floor(o / 1000)));

const PHANTOM_MSGS = [
  'sync frame received',
  'transit lock confirmed',
  'mirror write ok',
  'handoff complete',
];

const ENVS    = ['prod', 'staging', 'dev'];
const LEVELS  = ['info', 'warn', 'error'];
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

  // Quiet period rows
  for (const svc of SERVICES_232) {
    const n = 232;
    for (let i = 0; i < n; i++) {
      const tsMs  = START_MS + Math.floor(i * QUIET_SPAN / n);
      const level = i % 25 === 0 ? 'error' : i % 8 === 0 ? 'warn' : 'info';
      rows.push({
        ts:      fmtTs(tsMs),
        message: `${svc} ${pick(LEVELS, seed)} event`,
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
        message: `${svc} ${pick(LEVELS, seed)} event`,
        service: svc,
        env:     pick(ENVS, seed + 3),
        level,
        region:  pick(REGIONS, seed + 7),
      });
      seed++;
    }
  }

  // Spike period rows (180 total, none on spike seconds)
  for (let k = 0; k < 180; k++) {
    let offset = Math.floor(k * SPIKE_SPAN / 180);
    // Shift off spike seconds to keep them clean for error rows
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

  // Spike-second error rows (4 seconds × 7 errors = 28 rows)
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

  // Phantom rows (4 total, one per spike second)
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

  const spikeWindowRows = rows.filter(r => r.ts >= fmtTs(SPIKE_MS) && r.ts < fmtTs(END_MS));
  if (!phantomRows.every(r => spikeWindowRows.includes(r)))
    throw new Error('Not all phantom rows fall in spike window');

  // All 4 phantom timestamps must match a spike second with ≥ 3 errors from other services
  const spikeSecondTs = SPIKE_OFFSETS_MS.map(o => fmtTs(SPIKE_MS + o).slice(0, 19));
  const spikeSatisfied = spikeSecondTs.every(sts => {
    const errs = rows.filter(r => r.ts.slice(0, 19) === sts && r.level === 'error' && r.service !== PHANTOM_SVC);
    return errs.length >= 3;
  });
  if (!spikeSatisfied)
    throw new Error('At least one spike second does not have ≥ 3 errors from non-phantom services');

  const START_STR = fmtTs(START_MS);
  const END_STR   = fmtTs(END_MS);
  const outOfRange = rows.filter(r => r.ts < START_STR || r.ts >= END_STR);
  if (outOfRange.length > 0)
    throw new Error(`${outOfRange.length} rows fall outside [08:00:00, 11:00:00]`);

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
```

- [ ] **Step 2: Run the generator**

```
node scripts/generate-ch8-logs.js
```

Expected output: `Generated 3000 rows → content/chapters/08-when/data/logs.parquet`

If invariant checks throw, fix the generator before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-ch8-logs.js content/chapters/08-when/data/logs.parquet
git commit -m "feat(ch8): add deterministic log generator and parquet dataset"
```

---

## Task 4: Chapter 8 Content Files

**Files:**
- Create: `content/chapters/08-when/seed.sql`
- Create: `content/chapters/08-when/chapter.json`
- Create: `content/chapters/08-when/puzzles/01.json` – `06.json`

**Notes:**
- `expected.sql` in every puzzle uses fully translated DuckDB syntax (no DDSQL) because `validate-content.js` runs it directly against DuckDB.
- All puzzles use `mechanic_mode: "typing"` with exactly one typed blank each.
- Tag keys in Ch8: `service`, `env`, `level`, `region` (no `host` or `status` — see generator).

- [ ] **Step 1: Create `content/chapters/08-when/seed.sql`**

```sql
SET VARIABLE ch8_anchor = TIMESTAMP '2026-04-26 11:00:00';
CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/08-when/data/logs.parquet');
```

- [ ] **Step 2: Create `content/chapters/08-when/chapter.json`**

```json
{
  "id": "08-when",
  "ordinal": 8,
  "title": "When",
  "era": "Chrono Consulting HQ, the next morning",
  "client": {
    "name": "Carol",
    "portrait": "carol.svg",
    "voice": "dry, tired, weirdly protective"
  },
  "boss_intro": "M.'s reply is taped above the corkboard — printout from this morning, three words in Carol's handwriting: I know that time.\n\nCarol doesn't explain what she sent. She pulls up a terminal.\n\nShe told us to find the seconds. We found them. She already knew. Which means whoever built chrono-portal-mirror has a schedule — and M. has seen it before.\n\nShe opens the log dataset. We have three hours of data. Eight to eleven. DDSQL time filter is @timestamp — open bracket, start, to, end, close bracket. now means the end of this dataset. We work backwards from there.",
  "concepts_introduced": ["time-windows"],
  "concepts_reviewed": ["select", "from", "where", "group-by", "order-by", "count", "ddsql-tags"],
  "mechanic_mode": "typing",
  "arc_hook": "M. already knew the spike seconds before we pulled them. chrono-portal-mirror was on a schedule — and someone knew what that schedule was.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "Carol writes the four spike-seconds on a Post-it and sticks it to the corkboard next to the phantom service rows. She photographs it — already sent it, apparently. Her phone is face-down on the desk.\n\nOkay. So she knew before we looked. Which means whoever this is — whatever chrono-portal-mirror is — it's not new. It's been running long enough that M. has a history with it.\n\nShe pulls up the traffic graphs. I want to know how fast it moves. Not just when — how much, and how fast."
}
```

- [ ] **Step 3: Create `content/chapters/08-when/puzzles/01.json`**

```json
{
  "id": "01",
  "concept": "logs-schema",
  "brief": {
    "speaker": "carol",
    "text": "First things first. Show me the time range we're working with. MIN and MAX of timestamp."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "MIN(timestamp) AS start, MAX(timestamp) AS end" },
    { "type": "keyword", "text": "FROM" },
    { "type": "blank",   "id": "tbl", "mode": "typed", "placeholder": "table name" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT MIN(timestamp) AS start, MAX(timestamp) AS end FROM logs",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'That returned more than one row. MIN and MAX together produce one summary row.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Empty result. The table is logs.'" },
    { "when": "error",            "text": "Carol: 'Query error. The table is logs. Nothing else.'" },
    { "when": "default",          "text": "Carol: 'FROM logs. The table is called logs. One row back.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Eight to eleven. Three hours. Whoever was moving, they were moving in that window."
  }
}
```

- [ ] **Step 4: Create `content/chapters/08-when/puzzles/02.json`**

```json
{
  "id": "02",
  "concept": "time-windows",
  "brief": {
    "speaker": "carol",
    "text": "Start with the last hour. @timestamp:[now-1h to now] — brackets, to between the bounds. Limit to twenty so we can read it."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "window", "mode": "typed", "placeholder": "time window filter" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "text",    "text": "20" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hours' AND timestamp <= getvariable('ch8_anchor') LIMIT 20",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many. The LIMIT is 20. Only the last hour — @timestamp:[now-1h to now].'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough. @timestamp:[now-1h to now] — open bracket, now-1h, to, now, close bracket.'" },
    { "when": "error",            "text": "Carol: 'Query error. @timestamp:[now-1h to now] — that exact form. Brackets and all.'" },
    { "when": "default",          "text": "Carol: '@timestamp:[now-1h to now] in the WHERE blank. Limit is already filled in.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "About a thousand rows. Normal background. Keep narrowing."
  }
}
```

- [ ] **Step 5: Create `content/chapters/08-when/puzzles/03.json`**

```json
{
  "id": "03",
  "concept": "time-windows",
  "brief": {
    "speaker": "carol",
    "text": "Bucket the last hour by minute. bucket(timestamp, 1m) — that's DATE_TRUNC in plain SQL, but shorter. Count per bucket, order by time."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "bucket", "mode": "typed", "placeholder": "bucket expression" },
    { "type": "text",    "text": "AS minute, COUNT(*) AS n" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "@timestamp:[now-1h to now]" },
    { "type": "keyword", "text": "GROUP BY" },
    { "type": "text",    "text": "minute" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "text",    "text": "minute" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT DATE_TRUNC('minute', timestamp) AS minute, COUNT(*) AS n FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hours' AND timestamp <= getvariable('ch8_anchor') GROUP BY minute ORDER BY minute",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many rows. bucket(timestamp, 1m) groups by minute — should be one row per minute.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough buckets. The last hour has sixty minutes. bucket(timestamp, 1m).'" },
    { "when": "error",            "text": "Carol: 'Query error. bucket(timestamp, 1m) — that exact form. Field, comma, interval.'" },
    { "when": "default",          "text": "Carol: 'bucket(timestamp, 1m) goes in the SELECT blank. Groups by minute, just like DATE_TRUNC.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Fifty-seven minutes in. Something happened there."
  }
}
```

- [ ] **Step 6: Create `content/chapters/08-when/puzzles/04.json`**

```json
{
  "id": "04",
  "concept": "time-windows",
  "brief": {
    "speaker": "carol",
    "text": "Last five minutes. That's the spike. Show me everything."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "window", "mode": "typed", "placeholder": "time window filter" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '5 minutes' AND timestamp <= getvariable('ch8_anchor')",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many. Five minutes only — @timestamp:[now-5m to now].'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough rows. The five-minute spike window should be around two hundred rows.'" },
    { "when": "error",            "text": "Carol: 'Query error. @timestamp:[now-5m to now] — m is minutes, not hours.'" },
    { "when": "default",          "text": "Carol: '@timestamp:[now-5m to now]. The spike is the last five minutes.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Two hundred rows. chrono-portal-mirror is in here. Four logs."
  }
}
```

- [ ] **Step 7: Create `content/chapters/08-when/puzzles/05.json`**

```json
{
  "id": "05",
  "concept": "time-windows",
  "brief": {
    "speaker": "carol",
    "text": "Bucket by second. Errors only. Last five minutes. I want to see which seconds had the most noise."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "bucket", "mode": "typed", "placeholder": "bucket expression" },
    { "type": "text",    "text": "AS second, COUNT(*) AS n" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "@timestamp:[now-5m to now] AND level:error" },
    { "type": "keyword", "text": "GROUP BY" },
    { "type": "text",    "text": "second" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "text",    "text": "second" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT DATE_TRUNC('second', timestamp) AS second, COUNT(*) AS n FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '5 minutes' AND timestamp <= getvariable('ch8_anchor') AND tags['level'] = 'error' GROUP BY second ORDER BY second",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many seconds with errors. The interval is 1s — bucket(timestamp, 1s).'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough. There are four spike seconds with errors. bucket(timestamp, 1s).'" },
    { "when": "error",            "text": "Carol: 'Query error. bucket(timestamp, 1s) — s is seconds, not seconds-plural.'" },
    { "when": "default",          "text": "Carol: 'bucket(timestamp, 1s) in the SELECT blank. 1s for seconds.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Four seconds. Four seconds in a five-minute window where errors spike. That's not random."
  }
}
```

- [ ] **Step 8: Create `content/chapters/08-when/puzzles/06.json`**

```json
{
  "id": "06",
  "concept": "ddsql-tags",
  "brief": {
    "speaker": "carol",
    "text": "Pull the phantom's logs. All four. I want to see the exact timestamps."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "timestamp, message" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "service filter" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "text",    "text": "timestamp" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT timestamp, message FROM logs WHERE tags['service'] = 'chrono-portal-mirror' ORDER BY timestamp",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many rows. service:chrono-portal-mirror — just that service.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough. There are exactly four phantom rows. service:chrono-portal-mirror.'" },
    { "when": "error",            "text": "Carol: 'Query error. service:chrono-portal-mirror — colon, no quotes, no equals.'" },
    { "when": "default",          "text": "Carol: 'service:chrono-portal-mirror. Filter on the service tag.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Those seconds. She already knew which ones."
  }
}
```

- [ ] **Step 9: Run content validator**

```
npm run validate-content
```

Expected: `Content valid` with no errors. If it fails, check that `expected.sql` values use DuckDB syntax (not DDSQL) and that the seed.sql is correct.

- [ ] **Step 10: Commit**

```bash
git add content/chapters/08-when/
git commit -m "feat(ch8): add seed.sql, chapter.json, and all 6 puzzle definitions"
```

---

## Task 5: Reference Doc and Engine Wiring

**Files:**
- Create: `content/reference/time-windows.md`
- Modify: `src/main.js`
- Modify: `src/reference.js`

- [ ] **Step 1: Create `content/reference/time-windows.md`**

```markdown
---
slug: time-windows
title: Time Windows
introduced_in: 08-when
---

# Time Windows

## @timestamp filter

Filter logs to a time range using `@timestamp:[start to end]`:

```sql
SELECT * FROM logs WHERE @timestamp:[now-1h to now]
```

The `to` separator is case-insensitive. Whitespace inside the brackets is ignored.

## Relative offsets

`now` is anchored to the dataset's end time, not the wall clock.

| Token | Meaning |
|-------|---------|
| `now` | Dataset end time |
| `now-1h` | 1 hour before dataset end |
| `now-30m` | 30 minutes before dataset end |
| `now-5m` | 5 minutes before dataset end |
| `now-10s` | 10 seconds before dataset end |

Supported units: `h` (hours), `m` (minutes), `s` (seconds).

## bucket()

Group by time interval using `bucket(field, interval)`:

```sql
SELECT bucket(timestamp, 1m) AS minute, COUNT(*) AS n
FROM logs
GROUP BY minute
ORDER BY minute
```

Equivalent to `DATE_TRUNC('minute', timestamp)` in standard SQL.

| DDSQL | Interval |
|-------|----------|
| `bucket(field, 1s)` | Second |
| `bucket(field, 1m)` | Minute |
| `bucket(field, 1h)` | Hour |

`bucket()` can appear in SELECT, GROUP BY, and ORDER BY.
```

- [ ] **Step 2: Update `src/main.js` — append `'08-when'` to `CHAPTER_ORDER`**

Change line 9 from:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern', '06-reunion', '07-static'];
```

to:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern', '06-reunion', '07-static', '08-when'];
```

- [ ] **Step 3: Update `src/reference.js` — add `'08-when'` entry to `CONCEPTS_FOR_CHAPTER`**

After the `'07-static'` block (after line 77), add:

```js
  '08-when': [
    { slug: 'select',               title: 'SELECT' },
    { slug: 'from',                 title: 'FROM' },
    { slug: 'where',                title: 'WHERE' },
    { slug: 'group-by',             title: 'GROUP BY' },
    { slug: 'order-by',             title: 'ORDER BY' },
    { slug: 'count',                title: 'COUNT' },
    { slug: 'ddsql-tags',           title: 'DDSQL tags' },
    { slug: 'time-windows',         title: 'Time windows' },
  ],
```

- [ ] **Step 4: Verify full test suite**

```
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add content/reference/time-windows.md src/main.js src/reference.js
git commit -m "feat(ch8): wire chapter into engine, add time-windows reference doc"
```

---

## Task 6: E2E Smoke Test

**Files:**
- Modify: `tests/e2e-smoke.spec.js`

- [ ] **Step 1: Append Chapter 8 smoke test to `tests/e2e-smoke.spec.js`**

Add the following test at the end of the file:

```js
test('Chapter 8 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '08-when',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '06-reunion':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '07-static':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('MIN and MAX');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(1);

  await inputs.nth(0).fill('logs');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});
```

- [ ] **Step 2: Start the server and run E2E tests**

In one terminal:
```
node server.js
```

In another:
```
npm run test:e2e
```

Expected: All Playwright tests pass, including the new Chapter 8 test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e-smoke.spec.js
git commit -m "test(e2e): add Chapter 8 Puzzle 01 smoke walkthrough"
```

---

## Task 7: Playtest Checklist

**Files:**
- Modify: `docs/playtest-checklist.md`

- [ ] **Step 1: Append Chapter 8 section to `docs/playtest-checklist.md`**

Add the following at the end of the file:

```markdown
## Chapter 8 — When (time windows + bucket)

### Boot and navigation
- [ ] Solving Chapter 7 Puzzle 06 auto-advances to Chapter 8; OR set localStorage state to land directly.
- [ ] Carol's boss-intro bubble references "I know that time" and "chrono-portal-mirror has a schedule."
- [ ] Progress indicator shows "When · Puzzle 1 of 6".
- [ ] Reference drawer shows Time windows tab alongside SELECT, FROM, WHERE, GROUP BY, ORDER BY, COUNT, DDSQL tags.
- [ ] Time windows reference renders correctly (forms, offset table, bucket table).

### Puzzle 01 — Time range
- [ ] One typed input visible (table name).
- [ ] Correct answer: `logs` → 1 row showing 08:00:00 start and 11:00:00 end. Success bubble.
- [ ] Wrong table name (e.g. `log`) → error hint.

### Puzzle 02 — Last hour filter
- [ ] Brief mentions `@timestamp:[now-1h to now]` explicitly.
- [ ] Typing `@timestamp:[now-1h to now]` → ~1000 rows limited to 20 shown. Success bubble.
- [ ] Typing `@timestamp:[now-3h to now]` → more than 20 rows available, still shows 20 (wrong-count-high hint or wrong-count-low depending on validator — the result count after LIMIT is 20, but result should match expected).
- [ ] Typing `level:error` → error hint (no @timestamp in WHERE).

### Puzzle 03 — Bucket by minute
- [ ] Brief mentions `bucket(timestamp, 1m)`.
- [ ] Typing `bucket(timestamp, 1m)` → ~60 rows (one per minute), order_sensitive. Success bubble.
- [ ] Typing `bucket(timestamp, 1h)` → 1 row (wrong count) → wrong-count-low hint.
- [ ] Carol's success text: "Fifty-seven minutes in. Something happened there."

### Puzzle 04 — Spike window
- [ ] Brief says "last five minutes."
- [ ] Typing `@timestamp:[now-5m to now]` → ~212 rows. Success bubble.
- [ ] Carol's success text mentions "chrono-portal-mirror" and "four logs."

### Puzzle 05 — Errors by second
- [ ] Brief mentions "bucket by second" and "errors only."
- [ ] Typing `bucket(timestamp, 1s)` → 4 rows (one per spike second). Success bubble.
- [ ] Typing `bucket(timestamp, 1m)` → fewer than 4 rows or wrong shape → wrong-count hint.
- [ ] Carol's success text: "Four seconds."

### Puzzle 06 — Phantom timestamps
- [ ] Brief says "all four."
- [ ] Typing `service:chrono-portal-mirror` → 4 rows ordered by timestamp. Success bubble.
- [ ] Carol's success text: "Those seconds. She already knew which ones."
- [ ] Chapter outro plays: Carol's Post-it note, "I want to know how fast it moves."
- [ ] Outro does NOT auto-advance (Chapter 9 not yet shipped).

### Reference drawer — Chapter 8
- [ ] Drawer shows 8 concepts: SELECT, FROM, WHERE, GROUP BY, ORDER BY, COUNT, DDSQL tags, Time windows.
- [ ] Time windows renders with @timestamp and bucket() sections.
- [ ] Switching between concepts works; aria-current updates.
```

- [ ] **Step 2: Commit**

```bash
git add docs/playtest-checklist.md
git commit -m "docs: add Chapter 8 playtest checklist section"
```

---

## Self-Review

**Spec coverage:**
- `translateTimeWindow` + `translateBucket` → Task 1 ✓
- Pipeline wiring in `server.js` → Task 2 ✓
- Generator + parquet → Task 3 ✓
- seed.sql, chapter.json, 6 puzzles → Task 4 ✓
- time-windows.md reference, `src/main.js`, `src/reference.js` → Task 5 ✓
- E2E smoke test → Task 6 ✓
- Playtest checklist → Task 7 ✓

**expected.sql consistency:**
- All puzzle expected.sql values use DuckDB form: `getvariable('ch8_anchor')`, `INTERVAL '1 hours'` (note: plural — matches `translateBound` output), `DATE_TRUNC(...)`, `tags['level'] = 'error'`.
- Puzzle 01 uses no DDSQL — plain DuckDB aggregate.
- Puzzle 06 uses tag translation only — no time window.

**Type consistency:**
- `translateTimeWindow` and `translateBucket` are both exported from `server/ddsql.js`.
- Both imported in `server.js` with the same names.
- Test file imports both from `'../server/ddsql.js'`.

**Interval pluralization:** `translateBound` outputs `'1 hours'`, `'1 minutes'`, `'1 seconds'` — DuckDB accepts both singular and plural. The unit tests assert the plural form. expected.sql files must match the translator output, so they also use `INTERVAL '1 hours'` etc.
