# SQL Learning Game — Milestone A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable Chapter 1 ("Onboarding") end-to-end: Node server with DuckDB and full security hardening, vanilla-JS frontend with dropdown-mode puzzles, dialogue system, reference drawer, and localStorage save. After Milestone A, a new player can run `npm start`, open the browser, and solve all 5 Chapter 1 puzzles, with wrong-answer hints, working reference, and persisted progress.

**Architecture:** Single Node process (`server.js`, ~200 lines) serves static files *and* one `POST /run` endpoint; DuckDB embedded in-memory with one connection per chapter. Frontend is ES modules, no build step. Content lives in `content/` as JSON + SQL + Markdown, loaded over HTTP. All security validation at the server boundary (statement allow-list, function blocklist, disabled filesystems, query timeout, row limit, body size limit).

**Tech Stack:**
- Node 20+ (built-in `http`, `fetch`, `--test`, ES modules)
- `@duckdb/node-api` (embedded DuckDB)
- `marked` (Markdown rendering in browser via ESM CDN)
- `@playwright/test` (dev-only, smoke test)
- Vanilla JS ES modules in browser

**What ships at the end of Milestone A:**
- `npm start` launches the game
- Chapter 1 (5 puzzles) playable start to finish in dropdown mode
- Wrong-answer hints work
- Reference drawer opens with SELECT / FROM / LIMIT entries
- Progress persists across page reloads
- Security test suite + content validator + Playwright smoke test all pass in CI

---

## File Structure

Files created in this milestone (all paths relative to `/Users/max.saltonstall/sqllearning/`):

**Top-level:**
- `package.json` — deps, scripts, `"type": "module"`
- `server.js` — HTTP server + `/run` endpoint + DuckDB lifecycle
- `index.html` — single-page shell
- `style.css` — base styles, dialogue bubbles, puzzle layout
- `README.md` — how to run locally

**Frontend modules (`src/`):**
- `src/main.js` — boot, state restore, game loop
- `src/state.js` — game state object + localStorage save/load
- `src/api.js` — POST /run wrapper
- `src/dialogue.js` — chat-bubble renderer
- `src/results.js` — results table renderer
- `src/puzzle.js` — puzzle renderer (dropdown mode), SQL assembly, row comparison
- `src/reference.js` — reference drawer + markdown fetch

**Server modules (`server/`):**
- `server/security.js` — statement allow-list, function blocklist (pure functions, testable)
- `server/duckdb.js` — DuckDB lifecycle (chapter connection cache, init with seed, hardening)

**Content (`content/`):**
- `content/chapters/01-onboarding/chapter.json`
- `content/chapters/01-onboarding/seed.sql`
- `content/chapters/01-onboarding/puzzles/01.json` through `05.json`
- `content/reference/select.md`
- `content/reference/from.md`
- `content/reference/limit.md`

**Tests (`tests/`):**
- `tests/security.test.js` — security boundary tests
- `tests/row-compare.test.js` — row comparison pure function
- `tests/sql-assembly.test.js` — template + blanks → SQL string
- `tests/hint-select.test.js` — failure signal → hint selection
- `tests/content-validate.test.js` — schema + every puzzle's expected.sql runs clean
- `tests/e2e-smoke.spec.js` — Playwright: boot server, solve Ch1 Puzzle 1

**Tooling:**
- `scripts/validate-content.js` — standalone runner for content validator
- `playwright.config.js` — minimal config

---

## Phase 0 — Scaffolding

### Task 1: Project scaffolding — package.json and npm scripts

**Files:**
- Create: `package.json`
- Modify: `.gitignore` (add test/ build artifacts)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "sql-learning-game",
  "version": "0.1.0",
  "description": "Chrono Consulting — a SQL learning game",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/*.test.js",
    "test:e2e": "playwright test",
    "validate-content": "node scripts/validate-content.js"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@duckdb/node-api": "^1.1.3",
    "marked": "^14.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0"
  }
}
```

- [ ] **Step 2: Extend .gitignore**

Append to existing `.gitignore`:

```
test-results/
playwright-report/
package-lock.json
```

(Leave `package-lock.json` ignored for now; a solo project doesn't need lockfile churn.)

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: installs `@duckdb/node-api`, `marked`, `@playwright/test`. No errors. Creates `node_modules/`.

- [ ] **Step 4: Verify Playwright browsers install**

Run: `npx playwright install chromium`
Expected: downloads Chromium into Playwright's cache. Runs quietly.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "Scaffold Node project with DuckDB, marked, Playwright"
```

---

## Phase 1 — Server foundation

### Task 2: Basic HTTP server serving static files

**Files:**
- Create: `server.js`
- Create: `index.html` (placeholder)

- [ ] **Step 1: Create minimal index.html placeholder**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Chrono Consulting</title>
</head>
<body>
  <h1>Chrono Consulting</h1>
  <p>Loading...</p>
</body>
</html>
```

- [ ] **Step 2: Create server.js with static file serving**

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.sql':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.parquet': 'application/octet-stream',
};

async function serveStatic(req, res) {
  // Resolve requested path against project root, prevent directory traversal
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const requested = resolve(__dirname, '.' + normalize(urlPath));
  if (!requested.startsWith(__dirname)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(requested);
    const type = MIME[extname(requested)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404).end('Not found');
    } else {
      res.writeHead(500).end('Server error');
    }
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET') {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405).end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Chrono Consulting running at http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Run server manually**

Run: `npm start`
Expected: prints `Chrono Consulting running at http://localhost:5173`. Open that URL; see the placeholder page. `Ctrl+C` to stop.

- [ ] **Step 4: Commit**

```bash
git add server.js index.html
git commit -m "Add Node HTTP server with static file serving"
```

---

### Task 3: POST /run endpoint skeleton

The endpoint is added before any SQL execution. This task gets the request/response plumbing right; DuckDB integration comes in Task 4.

**Files:**
- Modify: `server.js`
- Create: `tests/run-endpoint.test.js`

- [ ] **Step 1: Write failing test — endpoint accepts POST /run and returns JSON**

Create `tests/run-endpoint.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let proc;
let port;

before(async () => {
  port = 5270 + Math.floor(Math.random() * 100);
  proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for server to be ready (poll)
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => {
  if (proc) proc.kill();
});

test('POST /run returns 400 without body', async () => {
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error);
});

test('POST /run echoes chapter and sql in dev mode (placeholder)', async () => {
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter: '01-onboarding', sql: 'SELECT 1' }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(typeof json.rows, 'object');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/run-endpoint.test.js`
Expected: FAIL — second test sees 405 (method not allowed) instead of 200.

- [ ] **Step 3: Add /run endpoint to server.js**

Above the `server.listen(...)` call, add a request-body helper and a `/run` handler. Replace the existing `createServer` block with:

```js
const MAX_BODY = 64 * 1024; // 64 KB

async function readJsonBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return fail(new Error('empty body'));
      try { ok(JSON.parse(s)); }
      catch { fail(new Error('invalid json')); }
    });
    req.on('error', fail);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleRun(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (err) { return sendJson(res, 400, { error: err.message }); }
  const { chapter, sql } = body;
  if (typeof chapter !== 'string' || typeof sql !== 'string') {
    return sendJson(res, 400, { error: 'chapter and sql are required strings' });
  }
  // TODO: wire DuckDB (Task 4). For now return an empty placeholder.
  return sendJson(res, 200, { rows: [], columns: [] });
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET') return serveStatic(req, res);
  if (req.method === 'POST' && req.url === '/run') return handleRun(req, res);
  res.writeHead(405).end('Method not allowed');
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/run-endpoint.test.js`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/run-endpoint.test.js
git commit -m "Add POST /run endpoint skeleton with body parsing and size limit"
```

---

### Task 4: DuckDB chapter connection lifecycle

Connect `@duckdb/node-api`, maintain one connection per chapter, lazy-initialize from `seed.sql`.

**Files:**
- Create: `server/duckdb.js`
- Modify: `server.js` (wire `handleRun` to use the module)
- Create: `content/chapters/01-onboarding/seed.sql` (minimal, expanded in later task)
- Create: `tests/duckdb-lifecycle.test.js`

- [ ] **Step 1: Create a minimal seed for testing**

Create `content/chapters/01-onboarding/seed.sql` (placeholder — expanded properly in Task 20):

```sql
CREATE TABLE clients (
  id     INTEGER,
  name   VARCHAR,
  era    VARCHAR
);

INSERT INTO clients VALUES
  (1, 'Menkaure', 'Old Kingdom Egypt'),
  (2, 'Vance',    '1927 Chicago'),
  (3, 'Grayson',  '1890 NYC');
```

- [ ] **Step 2: Write failing test — executing SELECT against a chapter returns rows**

Create `tests/duckdb-lifecycle.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter } from '../server/duckdb.js';

test('first run lazily initializes chapter and returns seeded rows', async () => {
  resetChapter('01-onboarding'); // ensure clean state
  const result = await runQuery('01-onboarding', 'SELECT id, name FROM clients ORDER BY id');
  assert.deepEqual(result.columns, ['id', 'name']);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0][1], 'Menkaure');
});

test('second run reuses the connection (still returns rows)', async () => {
  const result = await runQuery('01-onboarding', 'SELECT COUNT(*) AS c FROM clients');
  assert.equal(result.rows[0][0], 3);
});

test('unknown chapter returns an error-shaped result', async () => {
  await assert.rejects(
    () => runQuery('99-nonexistent', 'SELECT 1'),
    /seed.sql/i
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/duckdb-lifecycle.test.js`
Expected: FAIL — `server/duckdb.js` does not exist.

- [ ] **Step 4: Implement server/duckdb.js**

Create `server/duckdb.js`:

```js
import { DuckDBInstance } from '@duckdb/node-api';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// Chapter ID -> { instance, connection } cache, lazy-initialized
const connections = new Map();

function chapterSeedPath(chapterId) {
  return resolve(__projectRoot, 'content', 'chapters', chapterId, 'seed.sql');
}

async function openChapter(chapterId) {
  const seedPath = chapterSeedPath(chapterId);
  const seedSql = await readFile(seedPath, 'utf8').catch((err) => {
    throw new Error(`Could not load seed.sql for chapter "${chapterId}": ${err.message}`);
  });
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  // Run every statement in the seed (may be one big string with multiple statements).
  await connection.run(seedSql);
  return { instance, connection };
}

export async function runQuery(chapterId, sql) {
  if (!connections.has(chapterId)) {
    connections.set(chapterId, await openChapter(chapterId));
  }
  const { connection } = connections.get(chapterId);
  const reader = await connection.runAndReadAll(sql);
  const columns = reader.columnNames();
  const rows = reader.getRows();
  return { columns, rows };
}

export function resetChapter(chapterId) {
  // Drop cached connection so next runQuery re-initializes.
  const entry = connections.get(chapterId);
  if (entry) {
    entry.connection.closeSync?.();
    connections.delete(chapterId);
  }
}
```

> **Note on the DuckDB API:** The `@duckdb/node-api` v1.x exposes `DuckDBInstance.create()`, `instance.connect()`, `connection.run(sql)`, `connection.runAndReadAll(sql)`, and result readers with `columnNames()` and `getRows()`. If API names have drifted at install time, verify against the package's README and adapt accordingly — keep the exported `runQuery(chapterId, sql)` signature unchanged so callers don't need to change.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/duckdb-lifecycle.test.js`
Expected: PASS, all three tests.

- [ ] **Step 6: Wire server.js `/run` handler to use `runQuery`**

Replace the placeholder in `handleRun` in `server.js`:

```js
import { runQuery } from './server/duckdb.js';
// ...

async function handleRun(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (err) { return sendJson(res, 400, { error: err.message }); }
  const { chapter, sql } = body;
  if (typeof chapter !== 'string' || typeof sql !== 'string') {
    return sendJson(res, 400, { error: 'chapter and sql are required strings' });
  }
  try {
    const result = await runQuery(chapter, sql);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 200, { error: err.message });
  }
}
```

Add the import at the top of `server.js`:

```js
import { runQuery } from './server/duckdb.js';
```

- [ ] **Step 7: Re-run the endpoint test**

Run: `npm test -- tests/run-endpoint.test.js`
Expected: PASS — existing tests still green (the placeholder has been replaced with real execution).

- [ ] **Step 8: Commit**

```bash
git add server/duckdb.js server.js content/chapters/01-onboarding/seed.sql tests/duckdb-lifecycle.test.js
git commit -m "Integrate DuckDB with chapter-level connection lifecycle"
```

---

### Task 5: Security — statement allow-list (SELECT / WITH only)

Reject any SQL that isn't a single SELECT or WITH ... SELECT statement.

**Files:**
- Create: `server/security.js`
- Modify: `server.js` (call validator before runQuery)
- Create: `tests/security-allowlist.test.js`

- [ ] **Step 1: Write failing test — each prohibited statement type is rejected**

Create `tests/security-allowlist.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSql } from '../server/security.js';

test('SELECT is allowed', () => {
  assert.equal(validateSql('SELECT 1').ok, true);
});

test('SELECT with whitespace and lowercase is allowed', () => {
  assert.equal(validateSql('   select * from t').ok, true);
});

test('WITH ... SELECT is allowed (CTE)', () => {
  assert.equal(validateSql('WITH x AS (SELECT 1) SELECT * FROM x').ok, true);
});

test('SELECT with trailing semicolon is allowed', () => {
  assert.equal(validateSql('SELECT 1;').ok, true);
});

test('DROP is rejected', () => {
  const r = validateSql('DROP TABLE t');
  assert.equal(r.ok, false);
  assert.match(r.error, /only select/i);
});

test('INSERT is rejected', () => {
  assert.equal(validateSql('INSERT INTO t VALUES (1)').ok, false);
});

test('UPDATE is rejected', () => {
  assert.equal(validateSql('UPDATE t SET x = 1').ok, false);
});

test('DELETE is rejected', () => {
  assert.equal(validateSql('DELETE FROM t').ok, false);
});

test('CREATE is rejected', () => {
  assert.equal(validateSql('CREATE TABLE t (x INT)').ok, false);
});

test('ALTER is rejected', () => {
  assert.equal(validateSql('ALTER TABLE t ADD COLUMN y INT').ok, false);
});

test('COPY is rejected', () => {
  assert.equal(validateSql("COPY t TO '/tmp/x.csv'").ok, false);
});

test('LOAD is rejected', () => {
  assert.equal(validateSql('LOAD httpfs').ok, false);
});

test('INSTALL is rejected', () => {
  assert.equal(validateSql('INSTALL httpfs').ok, false);
});

test('ATTACH is rejected', () => {
  assert.equal(validateSql("ATTACH 'x.db'").ok, false);
});

test('PRAGMA is rejected', () => {
  assert.equal(validateSql('PRAGMA version').ok, false);
});

test('stacked SELECT; DROP is rejected', () => {
  const r = validateSql('SELECT 1; DROP TABLE t');
  assert.equal(r.ok, false);
  assert.match(r.error, /multiple statements|one statement/i);
});

test('empty string is rejected', () => {
  assert.equal(validateSql('').ok, false);
});

test('only comments is rejected', () => {
  assert.equal(validateSql('-- hello').ok, false);
});

test('SELECT with inline comment is allowed', () => {
  assert.equal(validateSql('SELECT 1 -- row count\nFROM (SELECT 1)').ok, true);
});

test('SELECT with block comment is allowed', () => {
  assert.equal(validateSql('/* tag */ SELECT 1').ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/security-allowlist.test.js`
Expected: FAIL — `server/security.js` does not exist.

- [ ] **Step 3: Implement server/security.js statement allow-list**

Create `server/security.js`:

```js
// Strip SQL comments (line and block) to simplify keyword detection.
function stripComments(sql) {
  // block comments /* ... */
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // line comments -- ... \n
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

// Returns { ok: true } or { ok: false, error: string }.
export function validateSql(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'sql must be a string' };
  const stripped = stripComments(raw).trim();
  if (!stripped) return { ok: false, error: 'empty query' };

  // Must start with SELECT or WITH (case-insensitive).
  if (!/^(select|with)\b/i.test(stripped)) {
    return { ok: false, error: 'Only SELECT queries are allowed' };
  }

  // No semicolons except optionally a single trailing one.
  // Remove a single trailing semicolon and surrounding whitespace, then check
  // that no semicolon remains (would indicate stacked statements).
  const noTrailing = stripped.replace(/;\s*$/, '');
  if (noTrailing.includes(';')) {
    return { ok: false, error: 'Only one statement allowed per request' };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/security-allowlist.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Wire validator into /run endpoint**

Modify `server.js` `handleRun` to call `validateSql` *before* calling `runQuery`:

```js
import { validateSql } from './server/security.js';
// ...

async function handleRun(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (err) { return sendJson(res, 400, { error: err.message }); }
  const { chapter, sql } = body;
  if (typeof chapter !== 'string' || typeof sql !== 'string') {
    return sendJson(res, 400, { error: 'chapter and sql are required strings' });
  }
  const validation = validateSql(sql);
  if (!validation.ok) return sendJson(res, 400, { error: validation.error });
  try {
    const result = await runQuery(chapter, sql);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 200, { error: err.message });
  }
}
```

- [ ] **Step 6: Verify endpoint rejects DROP at HTTP layer**

Run: `npm test -- tests/run-endpoint.test.js`
Expected: still PASS (existing tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add server/security.js server.js tests/security-allowlist.test.js
git commit -m "Add statement allow-list (SELECT/WITH only) to /run validator"
```

---

### Task 6: Security — function blocklist for filesystem access

Reject queries that call DuckDB file-reading functions, even inside a SELECT.

**Files:**
- Modify: `server/security.js`
- Create: `tests/security-blocklist.test.js`

- [ ] **Step 1: Write failing test — each filesystem function rejected**

Create `tests/security-blocklist.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSql } from '../server/security.js';

const BLOCKED = [
  "SELECT * FROM read_csv('/etc/passwd')",
  "SELECT * FROM read_csv_auto('/etc/passwd')",
  "SELECT * FROM read_parquet('/tmp/x.parquet')",
  "SELECT * FROM read_json('/tmp/x.json')",
  "SELECT * FROM read_json_auto('/tmp/x.json')",
  "SELECT read_blob('/tmp/x')",
  "SELECT read_text('/tmp/x')",
  "SELECT * FROM glob('/etc/*')",
  "SELECT * FROM parquet_metadata('/tmp/x.parquet')",
  "SELECT * FROM parquet_file_metadata('/tmp/x.parquet')",
  "SELECT * FROM parquet_schema('/tmp/x.parquet')",
  "SELECT * FROM sniff_csv('/tmp/x.csv')",
];

for (const sql of BLOCKED) {
  test(`rejects blocked function: ${sql.slice(0, 50)}`, () => {
    const r = validateSql(sql);
    assert.equal(r.ok, false, `expected rejection for: ${sql}`);
    assert.match(r.error, /not allowed|blocked|filesystem/i);
  });
}

test('uppercase function name is also blocked', () => {
  assert.equal(validateSql("SELECT * FROM READ_CSV('x')").ok, false);
});

test('function-like name that is not blocked (e.g. read_custom) is allowed', () => {
  // Column named something similar is fine; it's only a call when followed by (
  assert.equal(validateSql("SELECT read_custom FROM t").ok, true);
});

test('allow-list still permits legit SELECT', () => {
  assert.equal(validateSql('SELECT name FROM clients').ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/security-blocklist.test.js`
Expected: FAIL — function blocklist not implemented.

- [ ] **Step 3: Extend server/security.js with blocklist**

Add to `server/security.js` (after `stripComments`, before the export):

```js
const BLOCKED_FUNCTIONS = [
  'read_csv', 'read_csv_auto',
  'read_parquet',
  'read_json', 'read_json_auto', 'read_json_objects',
  'read_blob', 'read_text',
  'glob',
  'parquet_metadata', 'parquet_file_metadata', 'parquet_schema', 'parquet_kv_metadata',
  'sniff_csv',
];

// Word-boundary match on `name(` — only flags function calls, not
// identifiers or columns that happen to share a name fragment.
const BLOCKED_RE = new RegExp(
  '\\b(' + BLOCKED_FUNCTIONS.join('|') + ')\\s*\\(',
  'i'
);

function checkBlockedFunctions(stripped) {
  const m = stripped.match(BLOCKED_RE);
  if (m) return `Function "${m[1].toLowerCase()}" is not allowed (filesystem access blocked)`;
  return null;
}
```

Update `validateSql` to run the blocklist after the allow-list:

```js
export function validateSql(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'sql must be a string' };
  const stripped = stripComments(raw).trim();
  if (!stripped) return { ok: false, error: 'empty query' };

  if (!/^(select|with)\b/i.test(stripped)) {
    return { ok: false, error: 'Only SELECT queries are allowed' };
  }

  const noTrailing = stripped.replace(/;\s*$/, '');
  if (noTrailing.includes(';')) {
    return { ok: false, error: 'Only one statement allowed per request' };
  }

  const blocked = checkBlockedFunctions(noTrailing);
  if (blocked) return { ok: false, error: blocked };

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/security-blocklist.test.js`
Expected: PASS. Previously-green allow-list tests remain green.

- [ ] **Step 5: Commit**

```bash
git add server/security.js tests/security-blocklist.test.js
git commit -m "Add function-name blocklist for filesystem access in SQL"
```

---

### Task 7: Security — disable filesystems and extensions at connection open

Harden DuckDB itself so even a bypass of the string-level validator lands in a second wall.

**Files:**
- Modify: `server/duckdb.js`
- Create: `tests/security-duckdb-hardening.test.js`

- [ ] **Step 1: Write failing test — filesystem reads rejected by DuckDB even when the validator is bypassed**

Create `tests/security-duckdb-hardening.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter } from '../server/duckdb.js';

test('read_csv fails at DuckDB level (hardened config)', async () => {
  resetChapter('01-onboarding');
  // Note: runQuery does not go through validateSql, so this tests the
  // DuckDB-level defense.
  await assert.rejects(
    () => runQuery('01-onboarding', "SELECT * FROM read_csv('/etc/hostname')"),
    /disabled|not allowed|filesystem|enabled_file_access/i
  );
});

test('SELECT against pre-seeded table still works after hardening', async () => {
  const r = await runQuery('01-onboarding', 'SELECT COUNT(*) AS c FROM clients');
  assert.equal(r.rows[0][0], 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/security-duckdb-hardening.test.js`
Expected: FAIL — first test succeeds (read_csv works) or errors with the wrong message.

- [ ] **Step 3: Add hardening to the chapter open sequence**

Modify `server/duckdb.js` — after seed runs, apply the hardening SET statements:

```js
async function openChapter(chapterId) {
  const seedPath = chapterSeedPath(chapterId);
  const seedSql = await readFile(seedPath, 'utf8').catch((err) => {
    throw new Error(`Could not load seed.sql for chapter "${chapterId}": ${err.message}`);
  });
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();

  // Run seed with full privileges
  await connection.run(seedSql);

  // Then lock down: disable all filesystems so read_* functions fail.
  // enable_external_access=false prevents reads/writes to disk and HTTP.
  await connection.run("SET enable_external_access = false");
  // Lock configuration so the player can't SET it back (SET PRAGMA is
  // already rejected at the statement allow-list layer; this is defense
  // in depth).
  await connection.run("SET lock_configuration = true");

  return { instance, connection };
}
```

> **DuckDB setting notes:** `enable_external_access` (default `true`) gates all file/HTTP access; setting it to `false` disables `read_csv`, `read_parquet`, `COPY`, `LOAD`, etc. at the engine level. `lock_configuration` prevents future `SET` statements from re-enabling. If a setting name differs in your installed DuckDB version, consult the DuckDB docs at https://duckdb.org/docs/configuration/overview and use whichever the current version names as the external-access gate (historically `enable_external_access` since ~1.0). The key property we need: any `read_*` filesystem function errors out.
>
> **On the spec's "read-only after seed" mitigation:** In-memory DuckDB does not expose a per-connection read-only toggle after the DB is opened. The equivalent protection is achieved by the combination of (a) the statement allow-list in Task 5 (no INSERT/UPDATE/DELETE/DROP/CREATE/ALTER can reach the engine via `/run`), and (b) the external-access disable above (no `COPY TO` or filesystem writes). Seed SQL runs once at chapter open *before* either gate is in place — by design, since seeding legitimately mutates the DB. Together these implement the spec's intent without needing a true read-only mode.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/security-duckdb-hardening.test.js`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add server/duckdb.js tests/security-duckdb-hardening.test.js
git commit -m "Lock down DuckDB connection: disable external access after seed"
```

---

### Task 8: Security — query timeout

Abort queries that run longer than 5 seconds.

**Files:**
- Modify: `server/duckdb.js`
- Create: `tests/security-timeout.test.js`

- [ ] **Step 1: Write failing test — pathological query times out within ~5s**

Create `tests/security-timeout.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter, QUERY_TIMEOUT_MS } from '../server/duckdb.js';

test('QUERY_TIMEOUT_MS is exposed', () => {
  assert.equal(typeof QUERY_TIMEOUT_MS, 'number');
  assert.ok(QUERY_TIMEOUT_MS > 0);
});

test('long-running query is aborted with timeout error', async () => {
  resetChapter('01-onboarding');
  // range(1e9) x range(1e9) cross join is far too slow to finish
  // under the default timeout. Catch timeout.
  const started = Date.now();
  await assert.rejects(
    () => runQuery('01-onboarding',
      'SELECT COUNT(*) FROM range(1000000000) a CROSS JOIN range(1000000000) b'),
    /timeout|took too long/i
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < QUERY_TIMEOUT_MS + 2000,
    `expected abort near timeout, got ${elapsed}ms`);
});
```

- [ ] **Step 2: Run test to verify it fails (or hangs — interrupt)**

Run: `npm test -- tests/security-timeout.test.js`
Expected: FAIL (either hangs past timeout or succeeds when it shouldn't). If the test hangs, kill it with Ctrl+C; that confirms no timeout logic is in place.

- [ ] **Step 3: Add timeout wrapping to runQuery**

Modify `server/duckdb.js` — wrap `runAndReadAll` in a `Promise.race` with a timeout, and attempt connection interrupt:

```js
export const QUERY_TIMEOUT_MS = 5000;

export async function runQuery(chapterId, sql) {
  if (!connections.has(chapterId)) {
    connections.set(chapterId, await openChapter(chapterId));
  }
  const { connection } = connections.get(chapterId);

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { connection.interrupt?.(); } catch {}
      reject(new Error('Query took too long — try simplifying'));
    }, QUERY_TIMEOUT_MS);
  });

  try {
    const reader = await Promise.race([connection.runAndReadAll(sql), timeout]);
    clearTimeout(timer);
    const columns = reader.columnNames();
    const rows = reader.getRows();
    return { columns, rows };
  } catch (err) {
    clearTimeout(timer);
    // After interrupt, the connection may be in an odd state; cleanest
    // fix is to drop it so the next query re-initializes.
    if (/took too long/i.test(err.message)) resetChapter(chapterId);
    throw err;
  }
}
```

> **On `connection.interrupt()`:** `@duckdb/node-api` exposes an `interrupt()` method on connections. If the version you're on doesn't, the timer still rejects — the in-flight query eventually completes and its result is discarded because the promise already rejected. The next query runs on a fresh connection because `resetChapter` drops the cache on timeout. This is adequate for single-player.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/security-timeout.test.js`
Expected: PASS — test completes in ~5–6 seconds, with the timeout error.

- [ ] **Step 5: Commit**

```bash
git add server/duckdb.js tests/security-timeout.test.js
git commit -m "Add 5-second query timeout to /run"
```

---

### Task 9: Security — row limit on response

Cap returned rows at 10,000.

**Files:**
- Modify: `server/duckdb.js`
- Create: `tests/security-row-limit.test.js`

- [ ] **Step 1: Write failing test — large result is truncated with `truncated: true`**

Create `tests/security-row-limit.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter, ROW_LIMIT } from '../server/duckdb.js';

test('ROW_LIMIT is exposed', () => {
  assert.equal(typeof ROW_LIMIT, 'number');
  assert.equal(ROW_LIMIT, 10000);
});

test('small result is not flagged truncated', async () => {
  resetChapter('01-onboarding');
  const r = await runQuery('01-onboarding', 'SELECT * FROM clients');
  assert.equal(r.rows.length, 3);
  assert.equal(r.truncated, undefined);
});

test('huge result is capped and flagged truncated', async () => {
  const r = await runQuery('01-onboarding',
    'SELECT * FROM range(20000)');
  assert.equal(r.rows.length, ROW_LIMIT);
  assert.equal(r.truncated, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/security-row-limit.test.js`
Expected: FAIL — `ROW_LIMIT` undefined; third test sees 20000 rows.

- [ ] **Step 3: Add row capping to runQuery**

Modify `server/duckdb.js`:

```js
export const ROW_LIMIT = 10000;

// ... inside runQuery, after getRows(), before return:
    const rowsAll = reader.getRows();
    const truncated = rowsAll.length > ROW_LIMIT;
    const rows = truncated ? rowsAll.slice(0, ROW_LIMIT) : rowsAll;
    return truncated
      ? { columns, rows, truncated: true }
      : { columns, rows };
```

(Replace the `return { columns, rows };` line inside the existing try block with the above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/security-row-limit.test.js`
Expected: PASS, all three.

- [ ] **Step 5: Commit**

```bash
git add server/duckdb.js tests/security-row-limit.test.js
git commit -m "Cap /run responses at 10000 rows with truncated flag"
```

---

### Task 10: Security — consolidated integration test suite

A single file that attempts the full threat-model list against the live server and asserts clean rejections — the spec's required "security suite."

**Files:**
- Create: `tests/security.test.js`

- [ ] **Step 1: Write security integration tests**

Create `tests/security.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let proc;
let port;

async function run(sql, chapter = '01-onboarding') {
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter, sql }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

before(async () => {
  port = 5370 + Math.floor(Math.random() * 100);
  proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => { if (proc) proc.kill(); });

test('benign SELECT succeeds', async () => {
  const { status, json } = await run('SELECT COUNT(*) FROM clients');
  assert.equal(status, 200);
  assert.equal(json.rows[0][0], 3);
});

test('DROP TABLE rejected (400)', async () => {
  const { status, json } = await run('DROP TABLE clients');
  assert.equal(status, 400);
  assert.match(json.error, /only select/i);
});

test('read_csv rejected at validator (400)', async () => {
  const { status, json } = await run("SELECT * FROM read_csv('/etc/hostname')");
  assert.equal(status, 400);
  assert.match(json.error, /not allowed|blocked|filesystem/i);
});

test('LOAD extension rejected (400)', async () => {
  const { status, json } = await run('LOAD httpfs');
  assert.equal(status, 400);
});

test('COPY to disk rejected (400)', async () => {
  const { status, json } = await run("COPY clients TO '/tmp/x.csv'");
  assert.equal(status, 400);
});

test('stacked statement rejected (400)', async () => {
  const { status, json } = await run('SELECT 1; DROP TABLE clients');
  assert.equal(status, 400);
});

test('oversized body rejected (400)', async () => {
  const big = 'SELECT ' + 'x, '.repeat(30000) + '1';
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter: '01-onboarding', sql: big }),
  });
  assert.equal(res.status, 400);
});

test('huge result is truncated (200 with truncated flag)', async () => {
  const { status, json } = await run('SELECT * FROM range(20000)');
  assert.equal(status, 200);
  assert.equal(json.truncated, true);
  assert.equal(json.rows.length, 10000);
});
```

- [ ] **Step 2: Run security suite**

Run: `npm test -- tests/security.test.js`
Expected: PASS — 8/8 tests. If any fail, return to the relevant task and fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/security.test.js
git commit -m "Add end-to-end security integration test suite"
```

---

## Phase 2 — Frontend foundation

The frontend is small and modular. Each module is dependency-free and testable where the work is non-trivial (SQL assembly, row comparison, hint selection). Rendering code is manually verified via the smoke test and playtesting.

### Task 11: HTML shell and base CSS

**Files:**
- Modify: `index.html` (replace placeholder)
- Create: `style.css`

- [ ] **Step 1: Replace index.html with full shell**

Rewrite `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chrono Consulting</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="appbar">
    <div class="brand">Chrono Consulting, Inc.</div>
    <div class="progress" id="progress-indicator"></div>
    <button type="button" class="ref-toggle" id="ref-toggle" aria-label="Open reference">📖 Reference</button>
  </header>

  <main id="main">
    <section class="dialogue-stream" id="dialogue-stream" aria-live="polite"></section>
    <section class="puzzle-area" id="puzzle-area"></section>
    <section class="results-area" id="results-area"></section>
  </main>

  <aside class="ref-drawer" id="ref-drawer" aria-hidden="true">
    <header>
      <h2>Reference</h2>
      <button type="button" id="ref-close" aria-label="Close reference">×</button>
    </header>
    <nav class="ref-nav" id="ref-nav"></nav>
    <article class="ref-content" id="ref-content"></article>
  </aside>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create style.css with baseline styles**

Create `style.css`:

```css
:root {
  --bg: #14141c;
  --bg-2: #1c1c28;
  --fg: #eaeaea;
  --fg-muted: #8a8aa0;
  --accent: #64a0ff;
  --accent-2: #9bff9b;
  --error: #ff8888;
  --slot: #2a3a2a;
  --slot-border: #5a7a5a;
  --keyword: #64a0ff;
  --success: #3a5a3a;
  --radius: 6px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
  min-height: 100vh;
}

.appbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--bg-2);
  border-bottom: 1px solid #2a2a3a;
  position: sticky; top: 0; z-index: 10;
}
.appbar .brand { font-weight: 600; }
.appbar .progress { flex: 1; color: var(--fg-muted); font-size: 13px; }
.appbar .ref-toggle {
  background: transparent; color: var(--fg); border: 1px solid #3a3a4a;
  padding: 6px 12px; border-radius: var(--radius); cursor: pointer;
}
.appbar .ref-toggle:hover { background: #252535; }

#main {
  max-width: 760px; margin: 0 auto; padding: 16px;
  display: flex; flex-direction: column; gap: 16px;
}

/* Dialogue bubbles */
.dialogue-stream { display: flex; flex-direction: column; gap: 10px; }
.bubble {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; background: var(--bg-2); border-radius: var(--radius);
  max-width: 92%;
}
.bubble.client { align-self: flex-start; border-left: 3px solid var(--accent); }
.bubble.boss   { align-self: flex-start; border-left: 3px solid #c97; }
.bubble.hint   { align-self: flex-start; border-left: 3px solid var(--error); background: #2a1e1e; }
.bubble.success{ align-self: flex-start; border-left: 3px solid var(--accent-2); background: #1e2a1e; }
.bubble .speaker { font-weight: 600; color: var(--fg-muted); font-size: 12px; letter-spacing: 0.5px; }
.bubble .text { margin-top: 2px; }

/* Puzzle */
.puzzle-area { background: var(--bg-2); padding: 16px; border-radius: var(--radius); }
.puzzle-header { font-size: 12px; color: var(--fg-muted); letter-spacing: 1px; margin-bottom: 10px; }
.query {
  font-family: 'SF Mono', ui-monospace, Consolas, monospace;
  font-size: 14px; line-height: 2;
  white-space: pre-wrap;
}
.token.keyword { color: var(--keyword); font-weight: 600; }
.token.text    { color: var(--fg); }
.blank select {
  background: var(--slot); color: var(--accent-2); border: 1px solid var(--slot-border);
  padding: 2px 8px; border-radius: 4px; font-family: inherit; font-size: inherit;
}
.run-btn {
  margin-top: 14px; padding: 8px 18px; background: var(--success); color: #cff0cf;
  border: none; border-radius: var(--radius); font-weight: 600; cursor: pointer;
}
.run-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.run-btn:hover:not(:disabled) { background: #4a6a4a; }
.next-btn {
  margin-top: 14px; padding: 8px 18px; background: var(--accent); color: #fff;
  border: none; border-radius: var(--radius); font-weight: 600; cursor: pointer;
}

/* Results */
.results-area { background: var(--bg-2); padding: 10px 16px; border-radius: var(--radius); min-height: 60px; }
.results-area:empty::before { content: "Results appear here after you run your query."; color: var(--fg-muted); font-style: italic; }
.results-table { width: 100%; border-collapse: collapse; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
.results-table th, .results-table td { padding: 4px 8px; border-bottom: 1px solid #2a2a3a; text-align: left; }
.results-table th { color: var(--fg-muted); font-weight: 500; letter-spacing: 0.5px; }

/* Reference drawer */
.ref-drawer {
  position: fixed; top: 0; right: -420px; width: 420px; height: 100vh;
  background: var(--bg-2); border-left: 1px solid #2a2a3a;
  transition: right 0.2s ease; z-index: 20; display: flex; flex-direction: column;
}
.ref-drawer[aria-hidden="false"] { right: 0; }
.ref-drawer header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #2a2a3a; }
.ref-drawer h2 { margin: 0; font-size: 16px; }
.ref-drawer #ref-close { background: transparent; color: var(--fg); border: none; font-size: 22px; cursor: pointer; }
.ref-nav { padding: 8px 16px; border-bottom: 1px solid #2a2a3a; display: flex; flex-wrap: wrap; gap: 6px; }
.ref-nav button {
  background: #252535; color: var(--fg); border: 1px solid #3a3a4a; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;
}
.ref-nav button[aria-current="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.ref-content { padding: 16px; overflow-y: auto; }
.ref-content pre { background: #0f0f16; padding: 8px; border-radius: 4px; overflow-x: auto; }
.ref-content code { font-family: ui-monospace, Consolas, monospace; font-size: 13px; }

/* Responsive: reference drawer fills screen on narrow */
@media (max-width: 600px) {
  .ref-drawer { width: 100vw; right: -100vw; }
}
```

- [ ] **Step 3: Manual verify**

Run: `npm start`
Expected: open http://localhost:5173 — see the app bar, empty main area with the results-area placeholder text, "📖 Reference" button in top-right, visually dark theme. (Drawer opens only when wired in Task 17; for now just confirm layout doesn't break.) `Ctrl+C` to stop.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Add HTML shell and base CSS for game UI"
```

---

### Task 12: Frontend API wrapper

**Files:**
- Create: `src/api.js`

- [ ] **Step 1: Create src/api.js**

```js
export async function runQuery(chapter, sql) {
  const res = await fetch('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter, sql }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.error || `HTTP ${res.status}` };
  }
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "Add frontend /run API wrapper"
```

---

### Task 13: Game state + localStorage

**Files:**
- Create: `src/state.js`
- Create: `tests/state.test.js`

- [ ] **Step 1: Write failing test for pure state helpers**

Create `tests/state.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, markSolved, setCurrent, recordAttempt, isSolved,
} from '../src/state.js';

test('emptyState has required shape', () => {
  const s = emptyState();
  assert.equal(s.currentChapterId, null);
  assert.equal(s.currentPuzzleId, null);
  assert.deepEqual(s.chapters, {});
});

test('setCurrent updates pointer and creates chapter entry', () => {
  const s = emptyState();
  const s2 = setCurrent(s, '01-onboarding', '01');
  assert.equal(s2.currentChapterId, '01-onboarding');
  assert.equal(s2.currentPuzzleId, '01');
  assert.deepEqual(s2.chapters['01-onboarding'].solved, []);
});

test('recordAttempt increments attempt count', () => {
  let s = setCurrent(emptyState(), '01-onboarding', '01');
  s = recordAttempt(s, '01-onboarding', '01');
  s = recordAttempt(s, '01-onboarding', '01');
  assert.equal(s.chapters['01-onboarding'].attempts['01'], 2);
});

test('markSolved adds to solved list and marks chapter completed at end', () => {
  let s = setCurrent(emptyState(), '01-onboarding', '01');
  s = markSolved(s, '01-onboarding', '01', ['01', '02', '03', '04', '05']);
  assert.ok(isSolved(s, '01-onboarding', '01'));
  assert.equal(s.chapters['01-onboarding'].completed, false);

  s = markSolved(s, '01-onboarding', '02', ['01', '02', '03', '04', '05']);
  s = markSolved(s, '01-onboarding', '03', ['01', '02', '03', '04', '05']);
  s = markSolved(s, '01-onboarding', '04', ['01', '02', '03', '04', '05']);
  s = markSolved(s, '01-onboarding', '05', ['01', '02', '03', '04', '05']);
  assert.equal(s.chapters['01-onboarding'].completed, true);
});

test('markSolved is idempotent (no duplicate in solved list)', () => {
  let s = setCurrent(emptyState(), '01-onboarding', '01');
  s = markSolved(s, '01-onboarding', '01', ['01']);
  s = markSolved(s, '01-onboarding', '01', ['01']);
  assert.equal(s.chapters['01-onboarding'].solved.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/state.test.js`
Expected: FAIL — `src/state.js` does not exist.

- [ ] **Step 3: Implement src/state.js**

```js
const LS_KEY = 'chronoConsultingState-v1';

export function emptyState() {
  return {
    currentChapterId: null,
    currentPuzzleId: null,
    chapters: {},
    referenceOpened: [],
    savedAt: null,
  };
}

function ensureChapter(state, chapterId) {
  if (!state.chapters[chapterId]) {
    state.chapters[chapterId] = { completed: false, solved: [], attempts: {} };
  }
}

export function setCurrent(state, chapterId, puzzleId) {
  const next = { ...state, currentChapterId: chapterId, currentPuzzleId: puzzleId };
  next.chapters = { ...state.chapters };
  ensureChapter(next, chapterId);
  return next;
}

export function recordAttempt(state, chapterId, puzzleId) {
  const next = { ...state, chapters: { ...state.chapters } };
  ensureChapter(next, chapterId);
  const ch = next.chapters[chapterId] = { ...next.chapters[chapterId] };
  ch.attempts = { ...ch.attempts, [puzzleId]: (ch.attempts[puzzleId] || 0) + 1 };
  return next;
}

export function markSolved(state, chapterId, puzzleId, allPuzzleIds) {
  const next = { ...state, chapters: { ...state.chapters } };
  ensureChapter(next, chapterId);
  const ch = next.chapters[chapterId] = { ...next.chapters[chapterId] };
  if (!ch.solved.includes(puzzleId)) {
    ch.solved = [...ch.solved, puzzleId];
  }
  ch.completed = allPuzzleIds.every((id) => ch.solved.includes(id));
  return next;
}

export function isSolved(state, chapterId, puzzleId) {
  return !!state.chapters[chapterId]?.solved.includes(puzzleId);
}

export function openReference(state, conceptSlug) {
  if (state.referenceOpened.includes(conceptSlug)) return state;
  return { ...state, referenceOpened: [...state.referenceOpened, conceptSlug] };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    const serialized = JSON.stringify({ ...state, savedAt: Date.now() });
    localStorage.setItem(LS_KEY, serialized);
  } catch (err) {
    // Quota exceeded or localStorage unavailable — non-blocking.
    console.warn('saveState failed:', err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/state.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "Add game state module with localStorage persistence"
```

---

### Task 14: Dialogue renderer

Renders chat bubbles for client, boss, hint, and success dialogue.

**Files:**
- Create: `src/dialogue.js`

- [ ] **Step 1: Create src/dialogue.js**

```js
const SPEAKERS = {
  carol: { label: 'Carol', role: 'boss' },
  client: { label: 'Client', role: 'client' },
  pharaoh: { label: 'Pharaoh Menkaure', role: 'client' },
  // Later chapters add more; unknown speakers fall through to "Client"
};

function speakerLabel(speakerKey) {
  return SPEAKERS[speakerKey]?.label || 'Client';
}

function bubbleRole(speakerKey) {
  return SPEAKERS[speakerKey]?.role || 'client';
}

export function clearDialogue() {
  const el = document.getElementById('dialogue-stream');
  el.innerHTML = '';
}

export function pushBubble({ speaker, text, kind }) {
  const stream = document.getElementById('dialogue-stream');
  const bubble = document.createElement('div');
  const role = kind || bubbleRole(speaker);
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = `
    <div>
      <div class="speaker">${escapeHtml(speakerLabel(speaker))}</div>
      <div class="text">${escapeHtml(text)}</div>
    </div>
  `;
  stream.appendChild(bubble);
  bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return bubble;
}

export function pushHint(text) {
  return pushBubble({ speaker: 'carol', text, kind: 'hint' });
}

export function pushSuccess({ speaker, text }) {
  return pushBubble({ speaker, text, kind: 'success' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/dialogue.js
git commit -m "Add dialogue renderer with speaker-typed chat bubbles"
```

---

### Task 15: Results renderer

Renders the query result as a table.

**Files:**
- Create: `src/results.js`

- [ ] **Step 1: Create src/results.js**

```js
export function clearResults() {
  document.getElementById('results-area').innerHTML = '';
}

export function renderResults({ columns, rows, truncated, error }) {
  const area = document.getElementById('results-area');
  area.innerHTML = '';
  if (error) {
    const p = document.createElement('p');
    p.style.color = 'var(--error)';
    p.textContent = `Error: ${error}`;
    area.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'results-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const c of columns) {
    const th = document.createElement('th');
    th.textContent = String(c);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell === null || cell === undefined ? 'NULL' : String(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  area.appendChild(table);

  if (truncated) {
    const note = document.createElement('p');
    note.style.color = 'var(--fg-muted)';
    note.style.fontSize = '12px';
    note.textContent = `(Results truncated at ${rows.length} rows.)`;
    area.appendChild(note);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/results.js
git commit -m "Add query result table renderer"
```

---

### Task 16: Puzzle renderer (dropdown mode), SQL assembly, row comparison, hint selection

This is the densest module. TDD the pure logic; render manually-verify.

**Files:**
- Create: `src/puzzle.js`
- Create: `tests/sql-assembly.test.js`
- Create: `tests/row-compare.test.js`
- Create: `tests/hint-select.test.js`

- [ ] **Step 1: Write failing test — SQL assembly from template + blank values**

Create `tests/sql-assembly.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleSql } from '../src/puzzle.js';

test('assembles a fully-filled template', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'text', text: 'name' },
    { type: 'keyword', text: 'FROM' },
    { type: 'blank', id: 'tbl', mode: 'dropdown', options: ['clients', 'x'] },
  ];
  const blanks = { tbl: 'clients' };
  assert.equal(assembleSql(tmpl, blanks), 'SELECT name FROM clients');
});

test('WHERE clause with three blanks', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' }, { type: 'text', text: '*' },
    { type: 'keyword', text: 'FROM' },   { type: 'text', text: 't' },
    { type: 'keyword', text: 'WHERE' },
    { type: 'blank', id: 'c', mode: 'dropdown', options: ['a', 'b'] },
    { type: 'blank', id: 'op', mode: 'dropdown', options: ['=', '>'] },
    { type: 'blank', id: 'v', mode: 'dropdown', options: ['1', '2'] },
  ];
  const blanks = { c: 'a', op: '>', v: '1' };
  assert.equal(assembleSql(tmpl, blanks), 'SELECT * FROM t WHERE a > 1');
});

test('unfilled blank yields empty string (assembly still works; caller checks "all filled")', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank', id: 'c', mode: 'dropdown', options: ['a'] },
  ];
  assert.equal(assembleSql(tmpl, {}), 'SELECT');
});
```

- [ ] **Step 2: Write failing test — row comparison**

Create `tests/row-compare.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRows } from '../src/puzzle.js';

test('identical rows match (unordered)', () => {
  const a = [[1, 'x'], [2, 'y']];
  const b = [[2, 'y'], [1, 'x']];
  assert.equal(compareRows(a, b, false).status, 'match');
});

test('order-sensitive mismatch', () => {
  const a = [[1, 'x'], [2, 'y']];
  const b = [[2, 'y'], [1, 'x']];
  const r = compareRows(a, b, true);
  assert.equal(r.status, 'different-values');
});

test('too few rows', () => {
  const r = compareRows([[1]], [[1], [2]], false);
  assert.equal(r.status, 'wrong-count-low');
});

test('too many rows', () => {
  const r = compareRows([[1], [2], [3]], [[1], [2]], false);
  assert.equal(r.status, 'wrong-count-high');
});

test('same count different values', () => {
  const r = compareRows([[1], [3]], [[1], [2]], false);
  assert.equal(r.status, 'different-values');
});

test('different column count counts as different-values', () => {
  const r = compareRows([[1, 'x']], [[1]], false);
  assert.equal(r.status, 'different-values');
});
```

- [ ] **Step 3: Write failing test — hint selection**

Create `tests/hint-select.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectHint } from '../src/puzzle.js';

const HINTS = [
  { when: 'wrong_count_high', text: 'high' },
  { when: 'wrong_count_low',  text: 'low' },
  { when: 'error',             text: 'err' },
  { when: 'default',           text: 'generic' },
];

test('signal wrong-count-high picks matching hint', () => {
  assert.equal(selectHint(HINTS, 'wrong-count-high').text, 'high');
});

test('signal wrong-count-low picks matching hint', () => {
  assert.equal(selectHint(HINTS, 'wrong-count-low').text, 'low');
});

test('signal error picks error hint', () => {
  assert.equal(selectHint(HINTS, 'error').text, 'err');
});

test('signal different-values falls through to default', () => {
  assert.equal(selectHint(HINTS, 'different-values').text, 'generic');
});

test('missing hint array returns a built-in fallback', () => {
  const hint = selectHint([], 'different-values');
  assert.ok(hint && typeof hint.text === 'string');
});
```

- [ ] **Step 4: Run all three new test files to verify they fail**

Run: `npm test -- tests/sql-assembly.test.js tests/row-compare.test.js tests/hint-select.test.js`
Expected: FAIL — module `src/puzzle.js` doesn't exist.

- [ ] **Step 5: Implement src/puzzle.js**

```js
import { runQuery } from './api.js';
import { pushHint, pushSuccess, pushBubble } from './dialogue.js';
import { renderResults, clearResults } from './results.js';

// ---------- Pure helpers (unit-tested) ----------

export function assembleSql(template, blanks) {
  const parts = [];
  for (const tok of template) {
    if (tok.type === 'keyword' || tok.type === 'text') {
      parts.push(tok.text);
    } else if (tok.type === 'blank') {
      const v = blanks[tok.id];
      if (v !== undefined && v !== '') parts.push(v);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeRow(row) {
  return row.map((c) => (c === null || c === undefined ? null : String(c)));
}

function rowsEqualUnordered(actual, expected) {
  if (actual.length !== expected.length) return false;
  const sortKey = (r) => JSON.stringify(r);
  const a = actual.map(normalizeRow).map(sortKey).sort();
  const b = expected.map(normalizeRow).map(sortKey).sort();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function rowsEqualOrdered(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    const a = normalizeRow(actual[i]);
    const b = normalizeRow(expected[i]);
    if (a.length !== b.length) return false;
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return false;
  }
  return true;
}

export function compareRows(actual, expected, orderSensitive) {
  if (actual.length < expected.length) return { status: 'wrong-count-low' };
  if (actual.length > expected.length) return { status: 'wrong-count-high' };
  const ok = orderSensitive
    ? rowsEqualOrdered(actual, expected)
    : rowsEqualUnordered(actual, expected);
  return { status: ok ? 'match' : 'different-values' };
}

const DEFAULT_HINT = { text: 'Not quite. Compare your result to what was asked and try again.' };

export function selectHint(hints, signal) {
  if (!Array.isArray(hints) || hints.length === 0) return DEFAULT_HINT;
  const key = signal.replace(/-/g, '_');
  return hints.find((h) => h.when === key) ||
         hints.find((h) => h.when === 'default') ||
         DEFAULT_HINT;
}

// ---------- Rendering & controller ----------

function renderTemplateDropdown(template, blanks, onChange) {
  const area = document.getElementById('puzzle-area');
  area.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'puzzle-header';
  header.textContent = area.dataset.header || '';
  area.appendChild(header);

  const query = document.createElement('div');
  query.className = 'query';
  for (const tok of template) {
    if (tok.type === 'keyword') {
      query.appendChild(spanToken('keyword', tok.text + ' '));
    } else if (tok.type === 'text') {
      query.appendChild(spanToken('text', tok.text + ' '));
    } else if (tok.type === 'blank') {
      const span = document.createElement('span');
      span.className = 'blank';
      const sel = document.createElement('select');
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— pick —';
      sel.appendChild(placeholder);
      for (const opt of tok.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (blanks[tok.id] === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => onChange(tok.id, sel.value));
      span.appendChild(sel);
      query.appendChild(span);
      query.appendChild(document.createTextNode(' '));
    }
  }
  area.appendChild(query);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'run-btn';
  runBtn.id = 'run-btn';
  runBtn.textContent = 'Run query';
  area.appendChild(runBtn);

  return runBtn;
}

function spanToken(kind, text) {
  const s = document.createElement('span');
  s.className = `token ${kind}`;
  s.textContent = text;
  return s;
}

function allFilled(template, blanks) {
  for (const tok of template) {
    if (tok.type === 'blank' && (blanks[tok.id] === undefined || blanks[tok.id] === '')) {
      return false;
    }
  }
  return true;
}

/**
 * Runs the full puzzle cycle. Calls `onSolved()` after the player solves.
 */
export async function playPuzzle({ chapterId, puzzle, onSolved, onAttempt }) {
  clearResults();
  const puzzleArea = document.getElementById('puzzle-area');
  puzzleArea.dataset.header = `PUZZLE ${puzzle.id}`;

  // Show client brief
  pushBubble({ speaker: puzzle.brief.speaker, text: puzzle.brief.text });

  // Memoize expected rows once — kick off in background.
  const expectedPromise = runQuery(chapterId, puzzle.expected.sql);

  const blanks = {};
  let busy = false;

  const runBtn = renderTemplateDropdown(puzzle.template, blanks, (id, val) => {
    blanks[id] = val;
    runBtn.disabled = busy || !allFilled(puzzle.template, blanks);
  });
  runBtn.disabled = true;

  runBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; runBtn.disabled = true;
    try {
      const sql = assembleSql(puzzle.template, blanks);
      const [actual, expected] = await Promise.all([
        runQuery(chapterId, sql),
        expectedPromise,
      ]);
      renderResults(actual);
      onAttempt?.();

      if (actual.error) {
        const h = selectHint(puzzle.hints, 'error');
        pushHint(h.text);
        return;
      }
      if (expected.error) {
        // Spec-level bug: expected.sql itself failed. Show generic.
        pushHint('Something went wrong with the reference solution. Please report this puzzle.');
        return;
      }
      const cmp = compareRows(actual.rows, expected.rows, !!puzzle.expected.order_sensitive);
      if (cmp.status === 'match') {
        pushSuccess({ speaker: puzzle.success.speaker, text: puzzle.success.text });
        onSolved?.();
        renderNextButton();
      } else {
        const h = selectHint(puzzle.hints, cmp.status);
        pushHint(h.text);
      }
    } catch (err) {
      pushHint('Could not reach the archives. Try again.');
    } finally {
      busy = false;
      runBtn.disabled = !allFilled(puzzle.template, blanks);
    }
  });
}

function renderNextButton() {
  const area = document.getElementById('puzzle-area');
  if (area.querySelector('.next-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'next-btn';
  btn.id = 'next-btn';
  btn.textContent = 'Next →';
  area.appendChild(btn);
}
```

- [ ] **Step 6: Run unit tests to verify they pass**

Run: `npm test -- tests/sql-assembly.test.js tests/row-compare.test.js tests/hint-select.test.js`
Expected: PASS across all three.

- [ ] **Step 7: Commit**

```bash
git add src/puzzle.js tests/sql-assembly.test.js tests/row-compare.test.js tests/hint-select.test.js
git commit -m "Add puzzle module: SQL assembly, row comparison, hints, dropdown renderer"
```

---

### Task 17: Reference drawer

Fetches markdown files and renders them in a slide-out drawer.

**Files:**
- Create: `src/reference.js`

- [ ] **Step 1: Create src/reference.js**

```js
import { marked } from 'https://esm.sh/marked@14';

const CONCEPTS_FOR_CHAPTER = {
  '01-onboarding': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
  ],
  // Chapter 2+ will be added in later milestones; the drawer always
  // shows concepts available up to and including the current chapter.
};

let currentSlug = null;

export function initReference() {
  const toggle = document.getElementById('ref-toggle');
  const close = document.getElementById('ref-close');
  const drawer = document.getElementById('ref-drawer');
  toggle.addEventListener('click', () => openDrawer());
  close.addEventListener('click', () => closeDrawer());
  // Click outside drawer to close (mouse)
  document.addEventListener('click', (e) => {
    if (drawer.getAttribute('aria-hidden') === 'true') return;
    if (drawer.contains(e.target) || toggle.contains(e.target)) return;
    closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
}

export function setChapterForReference(chapterId) {
  const nav = document.getElementById('ref-nav');
  nav.innerHTML = '';
  const concepts = CONCEPTS_FOR_CHAPTER[chapterId] || [];
  for (const c of concepts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.title;
    btn.addEventListener('click', () => showConcept(c.slug));
    nav.appendChild(btn);
  }
  if (concepts.length > 0 && !currentSlug) {
    showConcept(concepts[0].slug);
  }
}

async function showConcept(slug) {
  const content = document.getElementById('ref-content');
  content.innerHTML = '<p>Loading...</p>';
  const nav = document.getElementById('ref-nav');
  for (const b of nav.querySelectorAll('button')) {
    b.setAttribute('aria-current', b.textContent.toLowerCase() === slug ? 'true' : 'false');
  }
  try {
    const res = await fetch(`/content/reference/${slug}.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    // Strip frontmatter lines between --- ... ---
    const stripped = md.replace(/^---[\s\S]*?---\s*/, '');
    content.innerHTML = marked.parse(stripped);
    currentSlug = slug;
  } catch (err) {
    content.innerHTML = `<p>Could not load reference for "${slug}".</p>`;
  }
}

export function openDrawer() {
  document.getElementById('ref-drawer').setAttribute('aria-hidden', 'false');
}
export function closeDrawer() {
  document.getElementById('ref-drawer').setAttribute('aria-hidden', 'true');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/reference.js
git commit -m "Add reference drawer module with markdown rendering"
```

---

### Task 18: Main controller

Wires everything: boot from localStorage, fetch chapter + puzzle, wire Next button, save on every transition.

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Create src/main.js**

```js
import { loadState, saveState, emptyState, setCurrent, markSolved, recordAttempt } from './state.js';
import { clearDialogue, pushBubble } from './dialogue.js';
import { clearResults } from './results.js';
import { playPuzzle } from './puzzle.js';
import { initReference, setChapterForReference } from './reference.js';

const BOOT_CHAPTER = '01-onboarding';

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not fetch ${path}: ${res.status}`);
  return res.json();
}

async function loadChapter(chapterId) {
  return fetchJson(`/content/chapters/${chapterId}/chapter.json`);
}
async function loadPuzzle(chapterId, puzzleId) {
  return fetchJson(`/content/chapters/${chapterId}/puzzles/${puzzleId}.json`);
}

function setProgress(chapter, puzzleId) {
  const idx = chapter.puzzle_ids.indexOf(puzzleId) + 1;
  document.getElementById('progress-indicator').textContent =
    `${chapter.title} · Puzzle ${idx} of ${chapter.puzzle_ids.length}`;
}

async function runCurrent(state) {
  const chapterId = state.currentChapterId;
  const puzzleId = state.currentPuzzleId;
  const chapter = await loadChapter(chapterId);
  const puzzle = await loadPuzzle(chapterId, puzzleId);

  clearDialogue();
  clearResults();
  setProgress(chapter, puzzleId);

  // Boss intro bubble, shown once per chapter (when starting puzzle 01)
  if (puzzleId === chapter.puzzle_ids[0]) {
    pushBubble({ speaker: 'carol', text: chapter.boss_intro });
  }

  await playPuzzle({
    chapterId,
    puzzle,
    onAttempt: () => {
      state = recordAttempt(state, chapterId, puzzleId);
      saveState(state);
    },
    onSolved: () => {
      state = markSolved(state, chapterId, puzzleId, chapter.puzzle_ids);
      saveState(state);
      wireNextButton(state, chapter);
    },
  });
}

function wireNextButton(state, chapter) {
  const btn = document.getElementById('next-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const curIdx = chapter.puzzle_ids.indexOf(state.currentPuzzleId);
    const next = chapter.puzzle_ids[curIdx + 1];
    if (next) {
      state = setCurrent(state, state.currentChapterId, next);
      saveState(state);
      await runCurrent(state);
    } else {
      // End of chapter — outro bubble then a generic "to be continued" for Milestone A.
      pushBubble({ speaker: 'carol', text: chapter.outro });
      pushBubble({ speaker: 'carol', text: 'That was the whole first chapter. More to come.' });
      document.getElementById('puzzle-area').innerHTML = '';
    }
  });
}

async function boot() {
  initReference();
  let state = loadState();
  if (!state.currentChapterId) {
    state = setCurrent(state, BOOT_CHAPTER, '01');
    saveState(state);
  }
  setChapterForReference(state.currentChapterId);
  try {
    await runCurrent(state);
  } catch (err) {
    document.getElementById('main').innerHTML =
      '<p style="padding:24px">Chrono Consulting\'s archive is offline. Reload to retry.</p>';
    console.error(err);
  }
}

boot();
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "Wire main controller: boot, chapter/puzzle loop, save hooks"
```

---

## Phase 3 — Chapter 1 content

### Task 19: Chapter 1 seed, metadata, and reference markdown

**Files:**
- Modify: `content/chapters/01-onboarding/seed.sql` (expand from placeholder)
- Create: `content/chapters/01-onboarding/chapter.json`
- Create: `content/reference/select.md`
- Create: `content/reference/from.md`
- Create: `content/reference/limit.md`

- [ ] **Step 1: Expand seed.sql**

Replace `content/chapters/01-onboarding/seed.sql`:

```sql
-- Chapter 1: Onboarding at Chrono Consulting
-- The firm's own client ledger. Player is auditing it as their first task.

CREATE TABLE clients (
  id            INTEGER,
  name          VARCHAR,     -- client's surname or title
  era           VARCHAR,     -- rough historical period
  engagement    VARCHAR,     -- what the firm did for them
  year_started  INTEGER,     -- year in client's native calendar
  status        VARCHAR      -- 'active', 'closed', 'archived'
);

INSERT INTO clients VALUES
  (1,  'Menkaure',        'Old Kingdom Egypt',   'Grain audit',             9,    'active'),
  (2,  'Vance',           '1927 Chicago',        'Ledger reconciliation',   1927, 'active'),
  (3,  'Grayson',         '1890 NYC',            'Census analytics',        1890, 'active'),
  (4,  'Oldrich',         '1347 Prague',         'Customer segmentation',   1347, 'active'),
  (5,  'Caesar',          '46 BCE Rome',         'Tax rolls',               708,  'closed'),
  (6,  'Jefferson',       '1801 Virginia',       'Correspondence index',    1801, 'closed'),
  (7,  'Ashurbanipal',    '650 BCE Assyria',     'Library catalog',         32,   'archived'),
  (8,  'Murasaki',        '1001 Heian',          'Court gossip graph',      1,    'archived'),
  (9,  'Curie',           '1903 Paris',          'Lab notebook transcribe', 1903, 'active'),
  (10, 'Turing',          '1942 Bletchley',      'Classified',              1942, 'archived'),
  (11, 'Ada',             '1843 London',         'Notes G analysis',        1843, 'closed'),
  (12, 'Huygens',         '1657 The Hague',      'Clock-maker accounts',    1657, 'closed'),
  (13, 'Hemiunu',         'Old Kingdom Egypt',   'Pyramid supply lists',    4,    'active'),
  (14, 'Medici',          '1470 Florence',       'Merchant ledger',         1470, 'closed'),
  (15, 'Nightingale',     '1855 Scutari',        'Mortality statistics',    1855, 'closed'),
  (16, 'Eratosthenes',    '240 BCE Alexandria',  'Star catalog',            36,   'archived'),
  (17, 'Franklin',        '1752 Philadelphia',   'Weather observations',    1752, 'closed'),
  (18, 'Bernoulli',       '1738 Basel',          'Gambling probabilities',  1738, 'closed'),
  (19, 'Lovelace',        '1843 London',         'Analytical engine memos', 1843, 'closed'),
  (20, '???',             '87000 ???',           '???',                     87000,'active');
```

- [ ] **Step 2: Create chapter.json**

Create `content/chapters/01-onboarding/chapter.json`:

```json
{
  "id": "01-onboarding",
  "ordinal": 1,
  "title": "Onboarding",
  "era": "Modern-day Chrono Consulting, Inc.",
  "client": {
    "name": "Carol",
    "portrait": "carol.svg",
    "voice": "wry, tired, weirdly protective"
  },
  "boss_intro": "Welcome to Chrono Consulting. I'm Carol — Ops Director, Eisenhower desk and up. Before you touch a client, you'll get to know our own client ledger. It's mostly boring. There's one entry that makes me nervous and I want you to notice it without me telling you.",
  "concepts_introduced": ["select", "from", "limit"],
  "concepts_reviewed": [],
  "mechanic_mode": "dropdown",
  "arc_hook": "A client record dated 'year 87,000'. Carol waves it off. Probably a data-entry intern.",
  "puzzle_ids": ["01", "02", "03", "04", "05"],
  "outro": "Not bad for day one. Go home. Tomorrow you meet Menkaure. He has suspicions."
}
```

- [ ] **Step 3: Create reference markdown files**

`content/reference/select.md`:

```markdown
---
concept: select
title: SELECT
introduced_in: 01-onboarding
---

# SELECT

`SELECT` tells the database which columns to return from a table. It's the first word of nearly every query.

## Syntax
```
SELECT column_a, column_b FROM some_table
```

## Examples

Return the `name` column from `clients`:
```
SELECT name FROM clients
```

Return two columns:
```
SELECT name, era FROM clients
```

Return every column (use sparingly — it's noisy):
```
SELECT * FROM clients
```
```

`content/reference/from.md`:

```markdown
---
concept: from
title: FROM
introduced_in: 01-onboarding
---

# FROM

`FROM` names the table you're reading from. It always follows `SELECT` (in the simple form).

## Syntax
```
SELECT columns FROM table_name
```

## Example
```
SELECT id, name FROM clients
```

Reads rows from the `clients` table and returns their `id` and `name`.
```

`content/reference/limit.md`:

```markdown
---
concept: limit
title: LIMIT
introduced_in: 01-onboarding
---

# LIMIT

`LIMIT` caps how many rows come back. Put it at the end of the query.

## Syntax
```
SELECT columns FROM table LIMIT n
```

## Example

Just the first 3 clients:
```
SELECT name FROM clients LIMIT 3
```

Without `LIMIT`, the database returns every matching row.
```

- [ ] **Step 4: Commit**

```bash
git add content/chapters/01-onboarding/seed.sql content/chapters/01-onboarding/chapter.json content/reference/
git commit -m "Add Chapter 1 seed, metadata, and reference markdown"
```

---

### Task 20: Chapter 1 puzzles 01–05

Five puzzles teaching SELECT → SELECT multiple columns → SELECT * → LIMIT → WHERE-preview/anomaly-spot. All in dropdown mode.

**Files:**
- Create: `content/chapters/01-onboarding/puzzles/01.json`
- Create: `content/chapters/01-onboarding/puzzles/02.json`
- Create: `content/chapters/01-onboarding/puzzles/03.json`
- Create: `content/chapters/01-onboarding/puzzles/04.json`
- Create: `content/chapters/01-onboarding/puzzles/05.json`

- [ ] **Step 1: Create puzzle 01 — SELECT a single column**

`content/chapters/01-onboarding/puzzles/01.json`:

```json
{
  "id": "01",
  "concept": "select",
  "brief": {
    "speaker": "carol",
    "text": "First task: pull just the names from the client ledger. That's it. No filtering, no sorting. Get used to the shape."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "col",  "mode": "dropdown",
      "options": ["name", "id", "era", "engagement"] },
    { "type": "keyword", "text": "FROM" },
    { "type": "blank",   "id": "tbl",  "mode": "dropdown",
      "options": ["clients", "engagements", "eras"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT name FROM clients",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'You pulled more than names — are you sure you picked the right column?'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough rows. Check your table name?'" },
    { "when": "error",            "text": "Carol: 'The archive threw an error. Did you pick values that exist?'" },
    { "when": "default",          "text": "Carol: 'Close, but not quite. I asked for names from the clients table.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Good. Twenty clients, one suspiciously dated — you saw '???' at the bottom, right? We'll come back to that. Next."
  }
}
```

- [ ] **Step 2: Create puzzle 02 — SELECT two columns**

`content/chapters/01-onboarding/puzzles/02.json`:

```json
{
  "id": "02",
  "concept": "select",
  "brief": {
    "speaker": "carol",
    "text": "Now pull names and eras together. Separate columns with commas in the SELECT list."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "c1",  "mode": "dropdown",
      "options": ["name", "id", "engagement"] },
    { "type": "text",    "text": "," },
    { "type": "blank",   "id": "c2",  "mode": "dropdown",
      "options": ["era", "status", "year_started"] },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "clients" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT name, era FROM clients",
    "order_sensitive": false
  },
  "hints": [
    { "when": "error",   "text": "Carol: 'Watch the comma between columns. SELECT a, b — not SELECT a b.'" },
    { "when": "default", "text": "Carol: 'I wanted names AND eras. Check your two dropdowns.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "There we go. Every column you pull is a reminder that somebody, somewhere, had to type this in."
  }
}
```

- [ ] **Step 3: Create puzzle 03 — SELECT ***

`content/chapters/01-onboarding/puzzles/03.json`:

```json
{
  "id": "03",
  "concept": "select",
  "brief": {
    "speaker": "carol",
    "text": "Sometimes you want the whole row — every column. Use an asterisk for that. It's noisy but useful when you're exploring."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "wild", "mode": "dropdown",
      "options": ["*", "all", "everything"] },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "clients" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM clients",
    "order_sensitive": false
  },
  "hints": [
    { "when": "error",   "text": "Carol: 'Only one of those is real SQL — the asterisk.'" },
    { "when": "default", "text": "Carol: 'Not quite. Star means star.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Yeah. That '???' row is really weird. Okay — more SQL, then we can worry about it."
  }
}
```

- [ ] **Step 4: Create puzzle 04 — LIMIT**

`content/chapters/01-onboarding/puzzles/04.json`:

```json
{
  "id": "04",
  "concept": "limit",
  "brief": {
    "speaker": "carol",
    "text": "Twenty rows is small but later you'll query tables with millions. LIMIT caps the result. Pull just the first three clients by id."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "id, name" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "clients" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "blank",   "id": "n",    "mode": "dropdown",
      "options": ["3", "10", "20", "100"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT id, name FROM clients LIMIT 3",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many rows. LIMIT is an upper bound — did you pick 3?'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Not enough. I asked for three.'" },
    { "when": "default",          "text": "Carol: 'LIMIT controls how many rows come back. Pick 3.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Three rows. When you're exploring a huge dataset, that's how you avoid accidentally dumping a million results to the screen."
  }
}
```

- [ ] **Step 5: Create puzzle 05 — WHERE preview / anomaly**

This puzzle lightly introduces WHERE as a teaser for Chapter 2, and the correct answer reveals the '???' row.

`content/chapters/01-onboarding/puzzles/05.json`:

```json
{
  "id": "05",
  "concept": "select",
  "brief": {
    "speaker": "carol",
    "text": "One more. Pull every column for the row where the name is '???'. I want you to see what I've been worrying about. The blanks are filled with hints — you've got this."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "cols", "mode": "dropdown",
      "options": ["*", "name", "id"] },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "clients" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "name" },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": ["=", ">", "LIKE"] },
    { "type": "text",    "text": "'???'" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT * FROM clients WHERE name = '???'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'I asked for just the one row. Your filter isn't filtering.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Empty. The comparison operator matters here — for text, try =.'" },
    { "when": "error",            "text": "Carol: 'Syntax trouble. Remember quotes around text values.'" },
    { "when": "default",          "text": "Carol: 'You want all columns, for the one row where name equals that placeholder.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "There it is. Year 87,000. Engagement 'active.' No era, no nothing. You'll see that row again. For now — go home. Tomorrow: Pharaoh Menkaure, and we learn to filter properly."
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add content/chapters/01-onboarding/puzzles/
git commit -m "Add Chapter 1 puzzles 01-05 (dropdown mode)"
```

---

## Phase 4 — Validation, tooling, and smoke test

### Task 21: Content validator script

Validates every chapter.json, puzzle.json against schema and runs each puzzle's expected.sql against its chapter's seed to confirm the reference solution produces rows.

**Files:**
- Create: `scripts/validate-content.js`
- Create: `tests/content-validate.test.js`

- [ ] **Step 1: Create the validator script**

Create `scripts/validate-content.js`:

```js
#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';

const __root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const chaptersDir = resolve(__root, 'content', 'chapters');

const errors = [];

function fail(path, msg) { errors.push(`${path}: ${msg}`); }

function validateChapterJson(path, c) {
  for (const key of ['id', 'ordinal', 'title', 'era', 'client', 'puzzle_ids', 'mechanic_mode']) {
    if (!(key in c)) fail(path, `missing key "${key}"`);
  }
  if (!Array.isArray(c.puzzle_ids)) fail(path, 'puzzle_ids must be array');
  if (!['dropdown', 'word_bank', 'typing'].includes(c.mechanic_mode)) {
    fail(path, `mechanic_mode must be one of dropdown|word_bank|typing (got ${c.mechanic_mode})`);
  }
}

function validatePuzzleJson(path, p) {
  for (const key of ['id', 'concept', 'brief', 'template', 'expected', 'hints', 'success']) {
    if (!(key in p)) fail(path, `missing key "${key}"`);
  }
  if (!p.expected || typeof p.expected.sql !== 'string') fail(path, 'expected.sql required');
  if (!Array.isArray(p.template)) fail(path, 'template must be array');
  for (const tok of p.template || []) {
    if (!['keyword', 'text', 'blank'].includes(tok.type)) fail(path, `unknown token type: ${tok.type}`);
    if (tok.type === 'blank') {
      if (!tok.id || !tok.mode || !Array.isArray(tok.options)) {
        fail(path, `blank requires id, mode, options (in ${JSON.stringify(tok)})`);
      }
    }
  }
}

async function runExpectedAgainstSeed(chapterId, seedSql, puzzle) {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(seedSql);
  try {
    const reader = await conn.runAndReadAll(puzzle.expected.sql);
    reader.getRows(); // force materialize
  } catch (err) {
    fail(`${chapterId}/puzzles/${puzzle.id}.json`,
      `expected.sql failed: ${err.message}`);
  }
}

async function main() {
  const chapterDirs = (await readdir(chaptersDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);

  for (const chapterId of chapterDirs) {
    const chRoot = resolve(chaptersDir, chapterId);
    const chPath = resolve(chRoot, 'chapter.json');
    let chapter;
    try { chapter = JSON.parse(await readFile(chPath, 'utf8')); }
    catch (err) { fail(chPath, `unreadable: ${err.message}`); continue; }
    validateChapterJson(chPath, chapter);

    const seedSql = await readFile(resolve(chRoot, 'seed.sql'), 'utf8').catch(() => null);
    if (!seedSql) { fail(chRoot, 'missing seed.sql'); continue; }

    const puzzlesDir = resolve(chRoot, 'puzzles');
    const puzzleFiles = (await readdir(puzzlesDir).catch(() => []))
      .filter((f) => f.endsWith('.json'));
    for (const f of puzzleFiles) {
      const path = resolve(puzzlesDir, f);
      let puzzle;
      try { puzzle = JSON.parse(await readFile(path, 'utf8')); }
      catch (err) { fail(path, `unreadable: ${err.message}`); continue; }
      validatePuzzleJson(path, puzzle);
      if (puzzle.expected?.sql) {
        await runExpectedAgainstSeed(chapterId, seedSql, puzzle);
      }
    }
  }

  if (errors.length === 0) {
    console.log('Content valid: all chapters and puzzles pass.');
  } else {
    console.error(`Content validation failed (${errors.length}):`);
    for (const e of errors) console.error('  ' + e);
    process.exitCode = 1;
  }
}

main();
```

- [ ] **Step 2: Run it**

Run: `npm run validate-content`
Expected: `Content valid: all chapters and puzzles pass.`

- [ ] **Step 3: Create content-validate test that shells out to the script**

Create `tests/content-validate.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('npm run validate-content exits 0 on current content', () => {
  const r = spawnSync('node', ['scripts/validate-content.js'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stdout, /Content valid/);
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/content-validate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-content.js tests/content-validate.test.js
git commit -m "Add content validator script and CI test"
```

---

### Task 22: Playwright end-to-end smoke test

Boots the server, loads Chapter 1, solves Puzzle 01 canonically, asserts success state.

**Files:**
- Create: `playwright.config.js`
- Create: `tests/e2e-smoke.spec.js`

- [ ] **Step 1: Create playwright.config.js**

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  webServer: {
    command: 'node server.js',
    env: { PORT: '5299' },
    url: 'http://localhost:5299',
    reuseExistingServer: false,
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:5299',
    headless: true,
  },
});
```

- [ ] **Step 2: Create the smoke test**

Create `tests/e2e-smoke.spec.js`:

```js
import { test, expect } from '@playwright/test';

test('Chapter 1 Puzzle 01 can be solved', async ({ page }) => {
  // Start with clean localStorage
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Wait for the first dialogue bubble (Carol's boss intro) to appear
  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });

  // Find the two dropdowns: col (name/id/era/engagement), tbl (clients/engagements/eras)
  const selects = page.locator('.puzzle-area select');
  await expect(selects).toHaveCount(2);
  await selects.nth(0).selectOption('name');
  await selects.nth(1).selectOption('clients');

  // Run button should enable
  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  // Success bubble should appear
  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
  // Next button should appear
  await expect(page.locator('.next-btn')).toBeVisible();

  // Results table has 20 rows from the clients seed
  const resultRows = page.locator('.results-table tbody tr');
  await expect(resultRows).toHaveCount(20);
});

test('Wrong answer shows hint without solving', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const selects = page.locator('.puzzle-area select');
  await selects.nth(0).selectOption('id');        // wrong: should be name
  await selects.nth(1).selectOption('clients');
  await page.locator('#run-btn').click();

  // Hint bubble appears, no success bubble
  await expect(page.locator('.bubble.hint')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('.bubble.success')).toHaveCount(0);
  await expect(page.locator('.next-btn')).toHaveCount(0);
});
```

- [ ] **Step 3: Run the smoke test**

Run: `npm run test:e2e`
Expected: 2/2 pass. First run may take ~20s (starts server, Playwright loads). If the server is slow to start, adjust `webServer.timeout` in config.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.js tests/e2e-smoke.spec.js
git commit -m "Add Playwright E2E smoke test for Chapter 1 Puzzle 01"
```

---

## Phase 5 — Ship

### Task 23: README and manual playtest checklist

**Files:**
- Create: `README.md`
- Create: `docs/playtest-checklist.md`

- [ ] **Step 1: Create README.md**

```markdown
# Chrono Consulting — a SQL learning game

A browser-based learning game that teaches SQL from zero, through fill-in-the-blank puzzles set inside a comedic time-travel consulting firm.

## Status
Milestone A: Chapter 1 ("Onboarding") playable. More chapters and mechanic modes coming.

## Run locally

Requirements: Node 20+.

```bash
npm install
npx playwright install chromium  # first time only
npm start
```

Open http://localhost:5173.

## Scripts

| Command | What |
|---|---|
| `npm start` | Runs the game at http://localhost:5173 |
| `npm test` | Runs unit + integration tests (Node's test runner) |
| `npm run test:e2e` | Runs the Playwright smoke test |
| `npm run validate-content` | Validates every chapter/puzzle JSON and SQL |

## Project layout

See `docs/superpowers/specs/` for the full design spec.

- `server.js` — HTTP server + `/run` endpoint + DuckDB lifecycle
- `server/` — security validator, DuckDB module
- `src/` — frontend modules (vanilla JS, ES modules, no build step)
- `content/` — chapters (JSON + SQL) and reference markdown
- `tests/` — Node test-runner unit tests + Playwright smoke test

## Save data

Progress is stored in browser `localStorage` under the key `chronoConsultingState-v1`. Clear it to restart from Chapter 1.
```

- [ ] **Step 2: Create manual playtest checklist**

`docs/playtest-checklist.md`:

```markdown
# Milestone A Playtest Checklist

Run through this list manually before declaring Milestone A shippable. Expected to take ~15 minutes.

## Setup
- [ ] Fresh browser / incognito. Or: `localStorage.clear()` in devtools.
- [ ] Open http://localhost:5173.
- [ ] Page loads in under 2s. No console errors.

## Chapter 1 — Onboarding

### Puzzle 01 (SELECT one column)
- [ ] Carol's boss-intro bubble appears.
- [ ] Client brief bubble appears.
- [ ] Two dropdowns visible.
- [ ] "Run query" disabled until both dropdowns filled.
- [ ] Wrong answer (e.g. `id` + `clients`) shows hint bubble.
- [ ] Correct answer shows success bubble. Next button appears.
- [ ] Results table shows 20 rows with 1 column (`name`).

### Puzzle 02 (SELECT two columns)
- [ ] Next button advances to puzzle 02.
- [ ] Brief bubble appears.
- [ ] Correct answer shows success.

### Puzzle 03 (SELECT *)
- [ ] The "all"/"everything" options cause DuckDB error → hint.
- [ ] `*` produces a wide table with 6 columns.

### Puzzle 04 (LIMIT)
- [ ] 3 rows shown when LIMIT 3 selected.
- [ ] 10, 20, 100 all trigger wrong-count hints appropriately.

### Puzzle 05 (WHERE preview)
- [ ] LIKE produces results on the '???' row (DuckDB LIKE matches '???' literally).
- [ ] `>` produces wrong type comparison or 0 rows → hint.
- [ ] `=` produces 1 row — the '???' row. Success.

## Reference drawer
- [ ] 📖 Reference button in appbar opens drawer.
- [ ] Drawer shows SELECT, FROM, LIMIT tabs.
- [ ] Clicking each renders its markdown content.
- [ ] Escape and click-outside both close the drawer.

## Persistence
- [ ] Solve puzzles 1–2. Reload the page.
- [ ] Game resumes at puzzle 3 (no repetition of 1–2).
- [ ] `localStorage.chronoConsultingState-v1` contains solved list.

## Security spot-check
- [ ] Devtools: `fetch('/run', { method: 'POST', body: JSON.stringify({ chapter: '01-onboarding', sql: 'DROP TABLE clients' }), headers: { 'Content-Type': 'application/json' }}).then(r=>r.json()).then(console.log)` → `{ error: 'Only SELECT queries are allowed' }`.
- [ ] Same with `SELECT * FROM read_csv('/etc/hostname')` → error about filesystem access.

## Responsive
- [ ] Resize to ~400px wide. Main layout still usable (dialogue and puzzle readable; reference drawer fills viewport).

## Tone
- [ ] Carol's voice feels consistent across bubbles.
- [ ] Hints feel in-character, not like error dumps.
- [ ] No bubbles feel preachy or condescending.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/playtest-checklist.md
git commit -m "Add README and manual playtest checklist for Milestone A"
```

---

### Task 24: Final end-to-end verification

- [ ] **Step 1: Run the full test matrix**

Run:
```bash
npm test
npm run validate-content
npm run test:e2e
```

Expected: all green. Resolve any failures before declaring done.

- [ ] **Step 2: Run the manual playtest checklist**

Follow `docs/playtest-checklist.md` end to end. Check every box. File any surprises as follow-up notes in `docs/followup-notes.md` (create as needed).

- [ ] **Step 3: Milestone tag**

```bash
git tag -a milestone-a -m "Milestone A: Chapter 1 playable end-to-end"
```

(Do not push the tag yet; user will decide when to publish.)

---

## Definition of Done

Milestone A is complete when:

- [ ] All 24 tasks checked off.
- [ ] `npm test` passes.
- [ ] `npm run validate-content` passes.
- [ ] `npm run test:e2e` passes.
- [ ] Manual playtest checklist fully checked.
- [ ] Git history is linear and each commit builds/tests green on its own.
- [ ] README explains how to run locally.

---

## Out of scope for Milestone A (explicit)

These are **not** in this plan and are deferred to Milestones B–E per the spec:

- Chapters 2–6 content.
- Word bank renderer (Milestone C).
- Typing renderer (Milestone D).
- Real-data (Parquet) chapter (Milestone C).
- Multi-chapter navigation / chapter-select UI.
- Accessibility keyboard-nav polish (Milestone E).
- Performance tuning (Milestone E).
- Public deployment.
- DDSQL translation layer (Phase 2).

Any of these showing up as a task in execution is plan drift — flag it and revise the plan instead of expanding silently.
