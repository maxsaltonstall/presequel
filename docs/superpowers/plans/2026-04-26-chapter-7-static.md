# Chapter 7 — Static: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chapter 7 — "Static": the first Phase 2 chapter, introducing DDSQL tag-based selection via a server-side `translateTagFilter()` translator, a pre-generated `logs.parquet` with 2000 rows (including 6 phantom `chrono-portal-mirror` entries), and a 6-puzzle arc that ends with Carol discovering an unknown service.

**Architecture:** New `server/ddsql.js` exports `translateTagFilter(sql)` — a pure function that rewrites DDSQL `key:value` tokens inside WHERE clauses into DuckDB `MAP` subscript equality. `server.js` pipes player SQL through the translator before the existing security validator. Chapter data lives in a pre-generated parquet committed to `content/chapters/07-static/data/`.

**Tech Stack:** Node.js 22, `@duckdb/node-api`, `node:test`, Playwright

---

## File map

**Created:**
- `server/ddsql.js` — `translateTagFilter()` pure function
- `tests/ddsql-tag-filter.test.js` — 8 unit tests for the translator
- `scripts/generate-logs.js` — one-shot parquet generator
- `content/chapters/07-static/data/logs.parquet` — generated, committed
- `content/chapters/07-static/seed.sql` — loads parquet into `logs` table
- `content/chapters/07-static/chapter.json` — chapter metadata + narrative
- `content/chapters/07-static/puzzles/01.json` through `06.json`
- `content/reference/ddsql-tags.md`

**Modified:**
- `server.js` — import `translateTagFilter`, call before `validateSql` (~line 122)
- `src/main.js` — append `'07-static'` to `CHAPTER_ORDER`
- `src/reference.js` — add `'07-static'` to `CONCEPTS_FOR_CHAPTER`
- `tests/e2e-smoke.spec.js` — Chapter 7 Puzzle 01 walkthrough
- `docs/playtest-checklist.md` — Chapter 7 section

---

### Task 1: DDSQL translator (TDD)

**Files:**
- Create: `tests/ddsql-tag-filter.test.js`
- Create: `server/ddsql.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/ddsql-tag-filter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateTagFilter } from '../server/ddsql.js';

test('single tag: key:value → tags[key] = value', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-svc"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc'"
  );
});

test('multi-tag: space-separated tokens → implicit AND', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-svc env:prod"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND tags['env'] = 'prod'"
  );
});

test('negation: -key:value → tags[key] != value', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE -level:info"),
    "SELECT * FROM logs WHERE tags['level'] != 'info'"
  );
});

test('mixed positive and negation', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-svc env:prod -level:info"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND tags['env'] = 'prod' AND tags['level'] != 'info'"
  );
});

test('pass-through: no WHERE clause returns input unchanged', () => {
  const sql = "SELECT timestamp, message, tags FROM logs LIMIT 10";
  assert.equal(translateTagFilter(sql), sql);
});

test('pass-through: already-translated DuckDB form returns input unchanged', () => {
  const sql = "SELECT * FROM logs WHERE tags['service'] = 'auth-svc'";
  assert.equal(translateTagFilter(sql), sql);
});

test('quoted value with spaces', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:'my service'"),
    "SELECT * FROM logs WHERE tags['service'] = 'my service'"
  );
});

test('wildcard value is preserved as literal (returns no rows, not an error)', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-*"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-*'"
  );
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- tests/ddsql-tag-filter.test.js
```
Expected: FAIL — `Cannot find module '../server/ddsql.js'`

- [ ] **Step 3: Write the implementation**

Create `server/ddsql.js`:

```js
function translateRun(run) {
  const tokenRe = /(-?)(\w+):('(?:[^']*)'|\S+)/g;
  const parts = [];
  let m;
  while ((m = tokenRe.exec(run)) !== null) {
    const [, neg, key, rawVal] = m;
    const op = neg === '-' ? '!=' : '=';
    const inner = rawVal.startsWith("'") ? rawVal.slice(1, -1) : rawVal;
    parts.push(`tags['${key}'] ${op} '${inner.replace(/'/g, "''")}'`);
  }
  return parts.join(' AND ');
}

// Translates DDSQL WHERE fragments to DuckDB MAP subscript syntax.
// Tokens of shape [-]key:value inside WHERE are rewritten; everything else passes through.
// Space-separated DDSQL tokens become implicit AND.
// Limitation: tag values that begin with a SQL clause keyword (e.g. LIMIT, HAVING) at a
// word boundary may cause the WHERE body to be truncated. Avoid such values.
export function translateTagFilter(sql) {
  return sql.replace(
    /(\bWHERE\b)([\s\S]*?)(?=\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING|UNION|EXCEPT|INTERSECT)\b|$)/gi,
    (_, kw, body) => {
      const runRe = /((?:-?\w+:(?:'[^']*'|\S+))(?:\s+(?:-?\w+:(?:'[^']*'|\S+)))*)/g;
      return kw + body.replace(runRe, translateRun);
    }
  );
}
```

- [ ] **Step 4: Run tests — all 8 must pass**

```
npm test -- tests/ddsql-tag-filter.test.js
```
Expected: 8 pass, 0 fail

- [ ] **Step 5: Run full test suite to confirm no regressions**

```
npm test
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```
git add server/ddsql.js tests/ddsql-tag-filter.test.js
git commit -m "feat(ddsql): add translateTagFilter stage — key:value → MAP subscript"
```

---

### Task 2: Wire translator into server pipeline

**Files:**
- Modify: `server.js:5,122`

- [ ] **Step 1: Add import to server.js**

At the top of `server.js`, after the existing imports, add:

```js
import { translateTagFilter } from './server/ddsql.js';
```

- [ ] **Step 2: Pipe SQL through translator before validateSql**

In `handleRun` in `server.js`, find the line (around line 122):

```js
  const validation = validateSql(sql);
```

Replace it with:

```js
  const translated = translateTagFilter(sql);
  const validation = validateSql(translated);
```

And on the line that calls `runQuery`, change the argument from `sql` to `translated`:

```js
    const result = await runQuery(chapter, translated);
```

(There is only one `runQuery` call in `handleRun`.)

- [ ] **Step 3: Run unit tests — still all pass**

```
npm test
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add server.js
git commit -m "feat(server): pipe player SQL through translateTagFilter before validator"
```

---

### Task 3: Logs parquet generator

**Files:**
- Create: `scripts/generate-logs.js`
- Create (generated): `content/chapters/07-static/data/logs.parquet`

Row counts that must match puzzle dialogue:
- Total rows: **2000** (puzzle invariant)
- `chrono-portal-mirror`: **6** (puzzle 06)
- `level = 'error'` total: **48** = 47 legitimate + 1 phantom (Carol says "Forty-eight errors")
- `service = 'auth-svc'`: **150** (Carol: "About a hundred fifty")
- `service = 'auth-svc' AND env = 'prod'`: **110** (Carol: "Down to a hundred and ten")
- `service = 'auth-svc' AND env = 'prod' AND level != 'info'`: **30** (Carol: "Thirty rows")

- [ ] **Step 1: Create the generator script**

Create `scripts/generate-logs.js`:

```js
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
```

- [ ] **Step 2: Run the generator**

```
node scripts/generate-logs.js
```
Expected output: `Generated 2000 rows → .../content/chapters/07-static/data/logs.parquet`

If sanity checks fail, the script throws and prints the failing invariant. Fix the distribution table and rerun.

- [ ] **Step 3: Verify the parquet exists and is non-empty**

```
ls -lh content/chapters/07-static/data/logs.parquet
```
Expected: file exists, size > 100 KB

- [ ] **Step 4: Quick DuckDB sanity check (optional but recommended)**

```
node -e "
import('@duckdb/node-api').then(async ({DuckDBInstance}) => {
  const inst = await DuckDBInstance.create(':memory:');
  const conn = await inst.connect();
  await conn.run(\"CREATE TABLE t AS SELECT * FROM read_parquet('content/chapters/07-static/data/logs.parquet')\");
  const r = await conn.runAndReadAll('SELECT COUNT(*) AS n FROM t');
  console.log(r.getRows());
  const e = await conn.runAndReadAll(\"SELECT COUNT(*) AS n FROM t WHERE tags[\\\"service\\\"] = 'chrono-portal-mirror'\");
  console.log(e.getRows());
  process.exit(0);
});
"
```
Expected: `[ [ 2000n ] ]` and `[ [ 6n ] ]`

- [ ] **Step 5: Commit generator + parquet**

```
git add scripts/generate-logs.js content/chapters/07-static/data/logs.parquet
git commit -m "feat(ch7): add logs parquet generator and pre-generated data (2000 rows)"
```

---

### Task 4: Chapter 7 content files

**Files:**
- Create: `content/chapters/07-static/seed.sql`
- Create: `content/chapters/07-static/chapter.json`
- Create: `content/chapters/07-static/puzzles/01.json` through `06.json`

All puzzle `expected.sql` values use DuckDB MAP syntax (not DDSQL), because `validate-content.js` runs them directly against the seeded DB. The player types DDSQL; the server translator converts it before execution.

- [ ] **Step 1: Create seed.sql**

Create `content/chapters/07-static/seed.sql`:

```sql
-- Chapter 7 seed: Chrono Consulting HQ — log stream, ~1 hour of telemetry.
-- Generated by scripts/generate-logs.js — do not edit by hand.
CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/07-static/data/logs.parquet');
```

- [ ] **Step 2: Create chapter.json**

Create `content/chapters/07-static/chapter.json`:

```json
{
  "id": "07-static",
  "ordinal": 7,
  "title": "Static",
  "era": "Chrono Consulting HQ, present day",
  "client": {
    "name": "Carol",
    "portrait": "carol.svg",
    "voice": "dry, tired, weirdly protective"
  },
  "boss_intro": "Carol drops a printout on your desk. Most of the page is redacted black. You can read the subject line — RE: forensic plan, post-Hemiunu — and one line of body: — if she's still in the country, get her on a video call by Wednesday. Otherwise pull her access. — M.\n\nShe's the CEO. The 'M' is initial, not name. Don't ask. She's three hours out and sending notes that arrive an hour before she does, which is a problem with our infrastructure as much as with her.\n\nCarol sits down. Logs are coming back online. About sixty percent. Whoever cut the observability didn't quite finish the job. Some of the gaps are interesting.\n\nShe gestures at the screen. We have a query language for log search — DDSQL. SQL-shaped, but tags use a colon. service:auth-svc is the same as service equals auth-svc. We're going to use it because that's what the data speaks. Same typing as last chapter. The forms haven't gotten fancier.",
  "concepts_introduced": ["ddsql-tags"],
  "concepts_reviewed": ["select", "from", "where", "limit"],
  "mechanic_mode": "typing",
  "arc_hook": "Logs are coming back online — sixty percent. Someone cut the observability before they left. Some of the gaps are interesting.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "Carol prints the six log lines and pins them to the corkboard above her desk. The corkboard already has Phase 1 artifacts on it — the patron register page from Oldrich's tavern, the four ledger lines from the Reunion. She moves those over to make room.\n\nHer phone buzzes. Voicemail. She lets it play on speaker.\n\nA woman's voice — older, clipped, mid-Atlantic the way 1950s movie stars used to sound. Carol. I see what you sent. I'll be on the ground at six. Don't touch the timestamps. We're going to want to know exactly when each of those fired. Not the order — the seconds. Find me the seconds.\n\nClick. No goodbye. No name.\n\nCarol turns off her speaker. Right. The seconds. That's tomorrow."
}
```

- [ ] **Step 3: Create puzzle 01 — schema intro**

Create `content/chapters/07-static/puzzles/01.json`:

```json
{
  "id": "01",
  "concept": "logs-schema",
  "brief": {
    "speaker": "carol",
    "text": "Show me ten lines. I want us both staring at the same thing before I ask anything else."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "cols", "mode": "typed", "placeholder": "columns to show" },
    { "type": "keyword", "text": "FROM" },
    { "type": "blank",   "id": "tbl",  "mode": "typed", "placeholder": "table name" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "text",    "text": "10" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT timestamp, message, tags FROM logs LIMIT 10",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'I asked for ten lines. That's more than ten.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough. Ten lines. The LIMIT is right there.'" },
    { "when": "error",            "text": "Carol: 'Something's wrong with the query. The table is called logs, three columns: timestamp, message, tags.'" },
    { "when": "default",          "text": "Carol: 'Three columns — timestamp, message, tags. Table is logs. Limit to ten.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Right. Time, message, tags. Tags is where we live this season. Get used to it."
  }
}
```

- [ ] **Step 4: Create puzzle 02 — single tag filter**

Create `content/chapters/07-static/puzzles/02.json`:

```json
{
  "id": "02",
  "concept": "ddsql-tags",
  "brief": {
    "speaker": "carol",
    "text": "Pull every log from auth-svc. In DDSQL — service:auth-svc. That's the new shape."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "tag filter" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE tags['service'] = 'auth-svc'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'That's too many. You want just auth-svc. service:auth-svc.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough rows. auth-svc logs for the last hour should be around 150.'" },
    { "when": "error",            "text": "Carol: 'Query error. Try: service:auth-svc — key colon value, no quotes, no equals sign.'" },
    { "when": "default",          "text": "Carol: 'service:auth-svc — the key is service, colon, then the value. That filters to just that service.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "About a hundred fifty. That's normal volume for an hour. Auth is the bottom of the stack — nothing builds on top of nothing."
  }
}
```

- [ ] **Step 5: Create puzzle 03 — implicit AND**

Create `content/chapters/07-static/puzzles/03.json`:

```json
{
  "id": "03",
  "concept": "ddsql-tags",
  "brief": {
    "speaker": "carol",
    "text": "Now narrow it to prod. Two tags, separated by a space. Implicit AND. DDSQL won't make you type the word."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "tag filter" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND tags['env'] = 'prod'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Still too many. You need both service:auth-svc and env:prod.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Too few. You want auth-svc in prod — space between the two tag conditions.'" },
    { "when": "error",            "text": "Carol: 'Query error. Two tags separated by a space — service:auth-svc env:prod. No AND needed.'" },
    { "when": "default",          "text": "Carol: 'service:auth-svc env:prod — two conditions, space between them. That is the AND.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Down to a hundred and ten. Staging and dev account for the rest. Carry on."
  }
}
```

- [ ] **Step 6: Create puzzle 04 — negation**

Create `content/chapters/07-static/puzzles/04.json`:

```json
{
  "id": "04",
  "concept": "ddsql-tags",
  "brief": {
    "speaker": "carol",
    "text": "Same query. Drop info-level. Negation in DDSQL is a leading hyphen on the tag — -level:info. Same way you'd remove a term from a search."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "tag filter" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND tags['env'] = 'prod' AND tags['level'] != 'info'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Still noise in there. The hyphen before the tag excludes it — -level:info.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Too few. service:auth-svc env:prod -level:info — three conditions.'" },
    { "when": "error",            "text": "Carol: 'Query error. Three tags: service:auth-svc env:prod -level:info. Leading hyphen is the negation.'" },
    { "when": "default",          "text": "Carol: 'service:auth-svc env:prod -level:info — the hyphen means NOT. Three tags, third one excluded.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Thirty rows. Now we can actually read them."
  }
}
```

- [ ] **Step 7: Create puzzle 05 — practice with level:error**

Create `content/chapters/07-static/puzzles/05.json`:

```json
{
  "id": "05",
  "concept": "ddsql-tags",
  "brief": {
    "speaker": "carol",
    "text": "Forget auth for a second. Show me everything that errored in the last hour. level:error, anywhere it lives. Take a moment to read the service column."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "tag filter" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE tags['level'] = 'error'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'That's more than just errors. level:error — only the error-level logs.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'There are more errors than that. level:error across all services.'" },
    { "when": "error",            "text": "Carol: 'Query error. level:error — key colon value, just like before, just a different key.'" },
    { "when": "default",          "text": "Carol: 'level:error. Single tag condition. All services.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Forty-eight errors. Forty-seven of them I can place. This one — chrono-portal-mirror. We don't have a service called that. Pull just its logs. All of them."
  }
}
```

- [ ] **Step 8: Create puzzle 06 — phantom finale**

Create `content/chapters/07-static/puzzles/06.json`:

```json
{
  "id": "06",
  "concept": "ddsql-tags",
  "brief": {
    "speaker": "carol",
    "text": "service:chrono-portal-mirror. Whatever it is, it's logging. Show me everything."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "*" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "logs" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "tag filter" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM logs WHERE tags['service'] = 'chrono-portal-mirror'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many. You want only chrono-portal-mirror — service:chrono-portal-mirror.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'There should be six rows. service:chrono-portal-mirror, exact name.'" },
    { "when": "error",            "text": "Carol: 'Query error. service:chrono-portal-mirror — hyphens are fine in values.'" },
    { "when": "default",          "text": "Carol: 'service:chrono-portal-mirror. Full value. Six rows.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Portal handshake initiated. Transit window aligned. Key exchange ok. Nothing about a customer, or a request, or a user. We don't deploy services with names like that. Whoever does, doesn't work for us. Or shouldn't."
  }
}
```

- [ ] **Step 9: Run content validator — must pass**

```
npm run validate-content
```
Expected: `Content valid: all chapters and puzzles pass.`

If it fails on Chapter 7 puzzles, check that the parquet file from Task 3 is present and the expected SQL in each puzzle uses DuckDB MAP syntax (not DDSQL syntax).

- [ ] **Step 10: Commit chapter content**

```
git add content/chapters/07-static/
git commit -m "feat(ch7): add chapter 7 Static — seed, chapter.json, 6 puzzles"
```

---

### Task 5: Reference doc and engine wiring

**Files:**
- Create: `content/reference/ddsql-tags.md`
- Modify: `src/main.js`
- Modify: `src/reference.js`

- [ ] **Step 1: Create the reference markdown**

Create `content/reference/ddsql-tags.md`:

```markdown
---
concept: ddsql-tags
title: DDSQL tags
introduced_in: 07-static
---

# DDSQL tags

DDSQL is SQL-shaped, but it filters on tags using a colon shorthand. Where regular SQL says `WHERE tags['service'] = 'auth-svc'`, DDSQL says `WHERE service:auth-svc` — same meaning, half the typing, no quotes around values that don't contain spaces.

## Forms

Single tag:
```ddsql
WHERE service:auth-svc
```

Multiple tags — implicit AND, no keyword needed:
```ddsql
WHERE service:auth-svc env:prod
```

Negation — leading hyphen excludes:
```ddsql
WHERE service:auth-svc env:prod -level:info
```

## Notes

- The key is whatever's left of the colon; the value is whatever's right.
- Spaces between tag conditions mean AND. There is no OR in this chapter.
- The hyphen is the negation operator. `-level:info` excludes rows where level equals info. It does not mean a key called `-level`.
- Quoted values work for spaces: `service:'my service with spaces'`.
- Tags you haven't seen before still work — DDSQL doesn't validate that the key exists. If no rows match, you get an empty result, not an error.
```

- [ ] **Step 2: Add '07-static' to CHAPTER_ORDER in src/main.js**

In `src/main.js`, find:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern', '06-reunion'];
```

Replace with:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern', '06-reunion', '07-static'];
```

- [ ] **Step 3: Add '07-static' to CONCEPTS_FOR_CHAPTER in src/reference.js**

In `src/reference.js`, after the `'06-reunion'` entry, add:

```js
  '07-static': [
    { slug: 'select',               title: 'SELECT' },
    { slug: 'from',                 title: 'FROM' },
    { slug: 'limit',                title: 'LIMIT' },
    { slug: 'where',                title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
    { slug: 'ddsql-tags',           title: 'DDSQL tags' },
  ],
```

- [ ] **Step 4: Run content validator and unit tests — still pass**

```
npm run validate-content && npm test
```
Expected: all pass

- [ ] **Step 5: Commit**

```
git add content/reference/ddsql-tags.md src/main.js src/reference.js
git commit -m "feat(ch7): wire chapter into engine — CHAPTER_ORDER, reference concepts, ddsql-tags doc"
```

---

### Task 6: E2E smoke test

**Files:**
- Modify: `tests/e2e-smoke.spec.js`

- [ ] **Step 1: Add Chapter 7 Puzzle 01 test**

At the end of `tests/e2e-smoke.spec.js`, add:

```js
test('Chapter 7 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '07-static',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '06-reunion':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('ten lines');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(2);

  await inputs.nth(0).fill('timestamp, message, tags');
  await inputs.nth(1).fill('logs');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});
```

- [ ] **Step 2: Start the server**

```
npm start &
```
Wait for: `Chrono Consulting running at http://localhost:5173`

- [ ] **Step 3: Run the new E2E test in isolation**

```
npx playwright test --grep "Chapter 7"
```
Expected: 1 passed

- [ ] **Step 4: Run full E2E suite**

```
npm run test:e2e
```
Expected: all tests pass (6 existing + 1 new)

- [ ] **Step 5: Kill the server**

```
kill %1
```

- [ ] **Step 6: Commit**

```
git add tests/e2e-smoke.spec.js
git commit -m "test(e2e): add Chapter 7 Puzzle 01 smoke test"
```

---

### Task 7: Playtest checklist

**Files:**
- Modify: `docs/playtest-checklist.md`

- [ ] **Step 1: Append the Chapter 7 section**

At the end of `docs/playtest-checklist.md`, add:

```markdown
## Chapter 7 — Static

### Boot and navigation
- [ ] Carol's boss-intro bubble mentions the redacted email and "M."
- [ ] Progress indicator shows "Static · Puzzle 1 of 6".
- [ ] Reference drawer shows DDSQL tags tab alongside SELECT, FROM, WHERE, LIMIT, Comparison ops.
- [ ] DDSQL tags reference renders correctly (forms, notes).

### Puzzle 01 — Schema intro (no DDSQL yet)
- [ ] Two typed inputs visible (columns, table name).
- [ ] Correct answer: `timestamp, message, tags` / `logs` → 10 rows, success bubble.
- [ ] Wrong column name (e.g. `ts`) → error hint.
- [ ] Wrong table name (e.g. `log`) → error hint.

### Puzzle 02 — Single tag filter
- [ ] Brief mentions `service:auth-svc`.
- [ ] Typing `service:auth-svc` → ~150 rows, success bubble.
- [ ] Typing `service:api-gateway` → different row count, no success.
- [ ] Typing `auth-svc` (no key:) → error hint (invalid SQL).

### Puzzle 03 — Implicit AND
- [ ] Brief mentions space-separated implicit AND.
- [ ] Typing `service:auth-svc env:prod` → ~110 rows, success.
- [ ] Typing just `service:auth-svc` → ~150 rows, wrong count hint.

### Puzzle 04 — Negation
- [ ] Brief mentions `-level:info` with the leading hyphen.
- [ ] Typing `service:auth-svc env:prod -level:info` → 30 rows, success.
- [ ] Typing `service:auth-svc env:prod level:info` (no hyphen) → wrong count.

### Puzzle 05 — All errors (phantom surface)
- [ ] Typing `level:error` → 48 rows, success.
- [ ] Success copy mentions `chrono-portal-mirror` and "Forty-eight errors."
- [ ] Brief for puzzle 06 appears immediately after success.

### Puzzle 06 — Phantom finale
- [ ] Typing `service:chrono-portal-mirror` → 6 rows, success.
- [ ] Success copy reads six cryptic messages.
- [ ] Chapter outro plays: voicemail from "M.", "Find me the seconds."
- [ ] Outro does NOT auto-advance to Chapter 8 (chapter 8 not yet shipped).
```

- [ ] **Step 2: Commit**

```
git add docs/playtest-checklist.md
git commit -m "docs: add Chapter 7 playtest checklist section"
```

---

## Self-review

**Spec coverage:**
- ✅ `translateTagFilter()` with all translation cases + pass-through (Task 1)
- ✅ Server pipeline `translateTagFilter → validateSql → runQuery` (Task 2)
- ✅ Generator with exact row counts matching puzzle dialogue (Task 3)
- ✅ `seed.sql` using `${CONTENT_ROOT}` pattern (Task 4, Step 1)
- ✅ 6 puzzle files with DDSQL templates + DuckDB expected SQL (Task 4, Steps 3–8)
- ✅ `content/reference/ddsql-tags.md` (Task 5, Step 1)
- ✅ `CHAPTER_ORDER` addition (Task 5, Step 2)
- ✅ `CONCEPTS_FOR_CHAPTER` addition (Task 5, Step 3)
- ✅ `tests/ddsql-tag-filter.test.js` (Task 1) — 8 test cases matching spec
- ✅ Playwright smoke test for Ch7 P01 (Task 6)
- ✅ Playtest checklist (Task 7)

**Spec items that are NOT in this plan (by design):**
- `scripts/generate-census-csv.js` rename → out of scope
- Wildcard `key:val*` translator — spec says explicitly out of scope for Ch7
- CEO audio voicemail — spec says default is text-only; no audio in this plan

**Type consistency check:**
- `translateTagFilter(sql: string): string` — used consistently across `server/ddsql.js`, `server.js`, and `tests/ddsql-tag-filter.test.js`
- `expected.sql` in puzzles 02–06 use `tags['key'] = 'value'` (DuckDB MAP subscript) consistently
- `mechanic_mode: "typing"` in `chapter.json` matches what `src/main.js` dispatches
