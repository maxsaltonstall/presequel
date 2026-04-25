# SQL Learning Game — Ship Milestone (production launch)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the game from "playable on localhost" to live at `sequel.maxsaltonstall.com` on AWS Lightsail, hardened for a public-facing deploy, with Datadog observability. At the end, Max shares the URL with playtesters and can watch traffic + errors in Datadog dashboards.

**Architecture:**
- **Compute:** AWS Lightsail Ubuntu 24.04 instance ($5/mo tier), static IP attached.
- **Process:** Node server run via `systemd` unit; restarts on crash; environment variables in a dotenv-style file loaded by systemd.
- **TLS + reverse proxy:** Caddy 2 on the same box, auto-provisions Let's Encrypt for `sequel.maxsaltonstall.com`, proxies to the Node server on localhost:5173.
- **Observability:** Datadog Agent on the host (host metrics, logs); `dd-trace` auto-instrumentation in Node (APM traces); custom metrics for security rejections and query counts.
- **Deploy:** `git pull && npm install --omit=dev && systemctl restart chrono` on the instance; push updates from the fresh GitHub repo.

**Tech Stack additions:**
- `dd-trace` (Node APM client)
- Caddy 2 (via apt)
- Datadog Agent (installer script)
- systemd, Lightsail, Let's Encrypt

**What ships at the end of this milestone:**
- Public URL `https://sequel.maxsaltonstall.com` serving Chapters 1–4
- Per-IP rate limiting on `/run` (generous but present)
- Request-body read timeout + graceful SIGTERM shutdown
- `GET /health` endpoint for monitoring
- Structured JSON logging to stdout (picked up by Datadog Agent)
- APM traces on every HTTP request + every DuckDB query
- Custom Datadog metrics: `chrono.query.run`, `chrono.query.rejected`, `chrono.query.duration`
- CSP header preventing XSS in the UI
- Fresh git repo in `sqllearning/`, pushed to GitHub
- `deploy.md` with a full-step Max-follows runbook

---

## File Structure

Files created:
- `server/ratelimit.js` — per-IP token bucket
- `server/logger.js` — structured JSON logger
- `server/content-root.js` — absolute path resolution helper
- `Caddyfile` — TLS + reverse proxy config
- `chrono.service` — systemd unit file template
- `deploy/provision.sh` — one-shot Ubuntu provisioning script
- `deploy/update.sh` — "git pull && restart" helper
- `deploy/datadog-agent.yaml` — Datadog Agent logs config
- `.env.example` — template for env vars (DD_API_KEY etc.)
- `docs/deploy.md` — the full Max-follows runbook

Files modified:
- `server.js` — wire up rate limiting, health check, graceful shutdown, CSP, logger
- `server/duckdb.js` — substitute `${CONTENT_ROOT}` in seed SQL for absolute paths; emit custom metrics
- `server/security.js` — emit custom metrics on rejection
- `content/chapters/04-census/seed.sql` — use `${CONTENT_ROOT}` placeholder
- `package.json` — add `dd-trace` dep, add `start:prod` script
- `README.md` — link to `docs/deploy.md`

---

## Phase 0 — Fresh git repo setup

### Task 1: Initialize a fresh git repo inside sqllearning/

**Rationale:** the current work is tracked in Max's home-directory git repo (where the origin remote points at `periodicshipper`). We need an independent repo we can push to a new GitHub repo.

**Files:**
- Create: `sqllearning/.git/` (via `git init`)

Working directory: `/Users/max.saltonstall/sqllearning`

- [ ] **Step 1: Verify state before init**

Check that you are in `/Users/max.saltonstall/sqllearning`. Check there is no `.git/` already inside this directory (nested init would clobber).

```bash
pwd   # must show /Users/max.saltonstall/sqllearning
ls -la .git 2>/dev/null   # should NOT exist
```

If a `.git` already exists here, STOP and report BLOCKED.

- [ ] **Step 2: Initialize the new repo and stage everything**

```bash
git init -b main
git add .
```

Confirm what gets added is everything under `sqllearning/` except the `.gitignore`-excluded patterns (`node_modules/`, `.superpowers/`, `test-results/`, `playwright-report/`, `package-lock.json`, `*.duckdb`, `*.duckdb.wal`, `.DS_Store`).

Run `git status` and confirm no unexpected files staged (no `node_modules`, no OS cruft). If any slipped through, update `.gitignore` and `git rm --cached` them before proceeding.

- [ ] **Step 3: Create the initial commit**

```bash
git commit -m "$(cat <<'EOF'
Initial commit: Chrono Consulting SQL learning game

Milestones A–C2: four chapters playable, dropdown and word-bank
mechanics, ~3000-row real-scale census for Ch4, full security
stack (SELECT/WITH allow-list, filesystem function blocklist,
DuckDB external-access disable, query timeout, row cap, body cap).

Original development branch: sqllearning-milestone-a in the
author's development environment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: this creates a single clean initial commit. The granular per-task history remains preserved in Max's original branch in the parent repo, for reference.

- [ ] **Step 4: Report and pause**

Print the commit SHA of the initial commit plus `git log --oneline`. Do NOT attempt to create the GitHub repo or set a remote — that happens in Task 8 after all the code hardening lands and Max creates the GitHub repo himself.

---

## Phase 1 — Production hardening

### Task 2: Absolute path resolution for content (CSV fix)

**Files:**
- Create: `server/content-root.js`
- Modify: `server/duckdb.js`
- Modify: `content/chapters/04-census/seed.sql`

- [ ] **Step 1: Create content-root.js**

```js
// server/content-root.js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The server/ directory's parent is the project root.
const __projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export const CONTENT_ROOT = resolve(__projectRoot, 'content');
```

- [ ] **Step 2: Modify server/duckdb.js to substitute `${CONTENT_ROOT}`**

Import the helper and do string replacement on the seed before running.

Find the seed-running block in `openChapter`. Before the statement loop, add:

```js
import { CONTENT_ROOT } from './content-root.js';
// ...
const expandedSeed = seedSql.replaceAll('${CONTENT_ROOT}', CONTENT_ROOT);
```

Then run `expandedSeed` through `extractStatements` (or whatever pattern is in place), NOT the raw `seedSql`.

- [ ] **Step 3: Update Ch4 seed to use the placeholder**

Change `content/chapters/04-census/seed.sql`:

Find:
```sql
CREATE TABLE census_1890 AS
  SELECT * FROM read_csv_auto('content/chapters/04-census/census_1890.csv');
```

Change to:
```sql
CREATE TABLE census_1890 AS
  SELECT * FROM read_csv_auto('${CONTENT_ROOT}/chapters/04-census/census_1890.csv');
```

- [ ] **Step 4: Verify with tests**

Run `npm run validate-content` — passes.
Run `npm test` — all green.
Run `npm run test:e2e` — 5/5.

- [ ] **Step 5: Commit**

```bash
git add server/content-root.js server/duckdb.js content/chapters/04-census/seed.sql
git commit -m "$(cat <<'EOF'
Resolve content paths to absolute; no longer depend on process cwd

Adds ${CONTENT_ROOT} placeholder expansion in seed SQL so the
Chapter 4 census CSV loads correctly regardless of how the server
process is started (systemd, local npm start, or a CI runner).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Per-IP rate limiting

Simple token bucket: 30 requests per IP per minute for `/run`. Static file requests are not rate limited.

**Files:**
- Create: `server/ratelimit.js`
- Modify: `server.js`
- Create: `tests/ratelimit.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/ratelimit.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBucket, checkAndConsume } from '../server/ratelimit.js';

test('bucket starts full and decrements on each consume', () => {
  const bucket = createBucket(5, 60_000);
  for (let i = 0; i < 5; i++) {
    assert.equal(checkAndConsume(bucket), true);
  }
  // 6th consume exceeds capacity
  assert.equal(checkAndConsume(bucket), false);
});

test('bucket refills over time', () => {
  const bucket = createBucket(2, 60_000);
  const t0 = 10_000_000;
  checkAndConsume(bucket, t0);
  checkAndConsume(bucket, t0);
  assert.equal(checkAndConsume(bucket, t0), false);
  // 30s later, one token should have regenerated
  assert.equal(checkAndConsume(bucket, t0 + 30_000), true);
});

test('unused bucket saturates at capacity', () => {
  const bucket = createBucket(3, 60_000);
  const t0 = 10_000_000;
  checkAndConsume(bucket, t0); // 2 tokens left
  // Wait long enough that buckets would over-refill if no cap
  const t1 = t0 + 10 * 60_000;
  // Still only 3 capacity
  checkAndConsume(bucket, t1);
  checkAndConsume(bucket, t1);
  checkAndConsume(bucket, t1);
  assert.equal(checkAndConsume(bucket, t1), false);
});
```

Run: `npm test -- tests/ratelimit.test.js`
Expected: FAIL (module missing).

- [ ] **Step 2: Implement ratelimit.js**

```js
// server/ratelimit.js
// Per-IP token bucket.
// capacity = max tokens; refillMs = ms for the bucket to fully refill from 0.

export function createBucket(capacity, refillMs) {
  return {
    capacity,
    refillRatePerMs: capacity / refillMs,
    tokens: capacity,
    lastRefillAt: null, // set on first use
  };
}

export function checkAndConsume(bucket, nowMs) {
  const now = nowMs ?? Date.now();
  if (bucket.lastRefillAt === null) {
    bucket.lastRefillAt = now;
  } else {
    const elapsed = now - bucket.lastRefillAt;
    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + elapsed * bucket.refillRatePerMs,
    );
    bucket.lastRefillAt = now;
  }
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

// Simple per-IP registry.
const buckets = new Map();
const CAPACITY = 30;
const REFILL_MS = 60_000;

export function allowRequest(ip) {
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = createBucket(CAPACITY, REFILL_MS);
    buckets.set(ip, bucket);
  }
  return checkAndConsume(bucket);
}

// Exposed for testing + monitoring
export function bucketCount() { return buckets.size; }
```

- [ ] **Step 3: Verify unit tests pass**

Run: `npm test -- tests/ratelimit.test.js` → PASS (3/3).

- [ ] **Step 4: Wire into server.js `/run`**

Add near the top of `server.js`:

```js
import { allowRequest } from './server/ratelimit.js';
```

Inside `handleRun`, before `readJsonBody`:

```js
  const ip = req.socket.remoteAddress || 'unknown';
  if (!allowRequest(ip)) {
    return sendJson(res, 429, { error: 'Rate limit exceeded — slow down.' });
  }
```

- [ ] **Step 5: Commit**

```bash
git add server/ratelimit.js tests/ratelimit.test.js server.js
git commit -m "$(cat <<'EOF'
Add per-IP rate limiting to /run (30 req/min token bucket)

Three unit tests cover capacity, refill, and cap saturation. Integration
point is handleRun: return 429 before reading body when bucket is empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Request body timeout + graceful shutdown + health endpoint

Three small server additions bundled.

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Body read timeout in readJsonBody**

Find the existing `readJsonBody` function. Add a 5-second timeout so slow-loris clients can't tie up connections:

```js
async function readJsonBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    const timeout = setTimeout(() => {
      fail(new Error('body read timeout'));
      req.destroy();
    }, 5000);
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        clearTimeout(timeout);
        fail(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      clearTimeout(timeout);
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return fail(new Error('empty body'));
      try { ok(JSON.parse(s)); }
      catch { fail(new Error('invalid json')); }
    });
    req.on('error', (err) => { clearTimeout(timeout); fail(err); });
  });
}
```

- [ ] **Step 2: Health endpoint**

Add a `GET /health` handler. Near the `createServer(async (req, res) => { ... })` block, add this case:

```js
if (req.method === 'GET' && req.url === '/health') {
  return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
}
```

Place it before the existing `if (req.method === 'GET') return serveStatic(...)` branch so the health check doesn't fall through to static-serving.

- [ ] **Step 3: Graceful shutdown**

At the bottom of `server.js`, after `server.listen(PORT, ...)`, add:

```js
function shutdown(signal) {
  console.log(JSON.stringify({ event: 'shutdown', signal, ts: new Date().toISOString() }));
  server.close(() => {
    process.exit(0);
  });
  // Force exit if not shut down within 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

- [ ] **Step 4: Verify**

Run: `npm test` → still green.
Run: `npm run test:e2e` → still 5/5.
Manual check: `npm start`, then `curl http://localhost:5173/health` → `{"status":"ok",...}`. `Ctrl+C` should log a shutdown event.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
Add body read timeout, /health endpoint, graceful shutdown

- readJsonBody: 5-second timeout for slow-client protection
- GET /health: tiny endpoint for load balancer / monitoring
- SIGTERM/SIGINT: close listener, exit cleanly, hard-kill after 10s

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Structured logging + CSP header + robots.txt

**Files:**
- Create: `server/logger.js`
- Create: `robots.txt`
- Modify: `server.js` (wire logger + CSP header on html responses)
- Modify: `index.html` (add meta tags for basic SEO/social behavior)

- [ ] **Step 1: Create server/logger.js**

```js
// server/logger.js
// Minimal JSON logger. One line per event, picked up by Datadog Agent via stdout.

function emit(level, event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    service: process.env.DD_SERVICE || 'chrono-consulting',
    env: process.env.DD_ENV || 'dev',
    ...fields,
  };
  // dd-trace injects dd.trace_id + dd.span_id when available via console log correlation
  process.stdout.write(JSON.stringify(record) + '\n');
}

export const log = {
  info:  (event, fields) => emit('info',  event, fields),
  warn:  (event, fields) => emit('warn',  event, fields),
  error: (event, fields) => emit('error', event, fields),
};
```

- [ ] **Step 2: Create robots.txt**

```
User-agent: *
Disallow: /run
```

(Not a strong barrier — just politely tells crawlers to skip the API endpoint.)

- [ ] **Step 3: Wire logger into server.js handleRun and shutdown**

Import at the top:

```js
import { log } from './server/logger.js';
```

Inside `handleRun`, add telemetry:

```js
async function handleRun(req, res) {
  const startNs = process.hrtime.bigint();
  const ip = req.socket.remoteAddress || 'unknown';

  if (!allowRequest(ip)) {
    log.warn('query.rate_limited', { ip });
    return sendJson(res, 429, { error: 'Rate limit exceeded — slow down.' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch (err) {
    log.warn('query.body_error', { ip, reason: err.message });
    return sendJson(res, 400, { error: err.message });
  }
  const { chapter, sql } = body;
  if (typeof chapter !== 'string' || typeof sql !== 'string') {
    return sendJson(res, 400, { error: 'chapter and sql are required strings' });
  }
  if (!/^[a-z0-9-]+$/.test(chapter)) {
    return sendJson(res, 400, { error: 'invalid chapter id' });
  }
  const validation = validateSql(sql);
  if (!validation.ok) {
    log.warn('query.rejected', { ip, chapter, reason: validation.error, sql_preview: sql.slice(0, 120) });
    return sendJson(res, 400, { error: validation.error });
  }
  try {
    const result = await runQuery(chapter, sql);
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    log.info('query.ok', {
      ip, chapter,
      rows: result.rows?.length ?? 0,
      truncated: !!result.truncated,
      duration_ms: Math.round(durationMs),
    });
    return sendJson(res, 200, result);
  } catch (err) {
    log.error('query.duckdb_error', { ip, chapter, reason: err.message });
    return sendJson(res, 200, { error: err.message });
  }
}
```

Also update the shutdown handler to use the logger:

```js
function shutdown(signal) {
  log.info('shutdown', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
```

- [ ] **Step 4: Add CSP header on HTML responses**

In `serveStatic`, after determining the MIME type and before sending, add headers for HTML:

Find:
```js
const type = MIME[extname(requested)] || 'application/octet-stream';
res.writeHead(200, { 'Content-Type': type }).end(data);
```

Change to:
```js
const type = MIME[extname(requested)] || 'application/octet-stream';
const headers = { 'Content-Type': type };
if (type.startsWith('text/html')) {
  // Restrictive CSP: only self + esm.sh (for marked library)
  headers['Content-Security-Policy'] =
    "default-src 'self'; " +
    "script-src 'self' https://esm.sh; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://esm.sh; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'";
  headers['X-Content-Type-Options'] = 'nosniff';
  headers['Referrer-Policy'] = 'no-referrer';
}
res.writeHead(200, headers).end(data);
```

- [ ] **Step 5: Verify**

Run tests. All still pass. Manually: `curl -I http://localhost:5173/` — should show CSP header.

- [ ] **Step 6: Commit**

```bash
git add server/logger.js robots.txt server.js
git commit -m "$(cat <<'EOF'
Add structured logger, CSP headers, robots.txt

- server/logger.js: JSON log lines for Datadog Agent ingestion
- /run: telemetry on query outcomes, rejections, rate limits
- serveStatic: CSP + nosniff + no-referrer on HTML responses
- robots.txt: discourage crawling the /run endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Datadog instrumentation

### Task 6: dd-trace + APM

**Files:**
- Modify: `package.json`
- Create: `server/tracer.js`
- Modify: `server.js` (import tracer first)

- [ ] **Step 1: Add dd-trace dependency**

Add to `package.json` dependencies:
```json
"dd-trace": "^5.0.0"
```

Run `npm install`.

- [ ] **Step 2: Create server/tracer.js**

```js
// server/tracer.js
// Initialize dd-trace BEFORE any other require/import that we want instrumented.
// The tracer no-ops if DD_TRACE_ENABLED is not set to "true".

import tracer from 'dd-trace';

if (process.env.DD_TRACE_ENABLED === 'true') {
  tracer.init({
    service: process.env.DD_SERVICE || 'chrono-consulting',
    env:     process.env.DD_ENV || 'dev',
    version: process.env.DD_VERSION || 'unknown',
    logInjection: true,  // adds dd.trace_id/dd.span_id to log records
  });
}

export default tracer;
```

- [ ] **Step 3: Import tracer as the FIRST thing in server.js**

At the very top of `server.js`, before all other imports:

```js
import './server/tracer.js';
```

This ordering matters — `dd-trace` monkey-patches Node's http module, so it has to run before `node:http` is imported.

- [ ] **Step 4: Verify**

Run `npm test` → green. dd-trace is effectively no-op unless `DD_TRACE_ENABLED=true` in the environment.

Try running with the flag once to sanity check: `DD_TRACE_ENABLED=true DD_TRACE_AGENT_URL=http://localhost:9999 npm start`. It should start and print a warning about the agent URL being unreachable, but not crash.

- [ ] **Step 5: Commit**

```bash
git add package.json server/tracer.js server.js
git commit -m "$(cat <<'EOF'
Add dd-trace APM (no-op unless DD_TRACE_ENABLED=true)

dd-trace is imported before node:http so it can monkey-patch. Tracer
init gates on DD_TRACE_ENABLED so local dev and tests don't try to
reach a Datadog agent. Log injection pipes dd.trace_id into the JSON
logger output for trace-log correlation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Custom Datadog metrics

**Files:**
- Create: `server/metrics.js`
- Modify: `server.js`, `server/security.js`

- [ ] **Step 1: Create server/metrics.js**

```js
// server/metrics.js
// Custom metrics via dd-trace's built-in metrics API (DogStatsD).
// No-op if dd-trace isn't initialized.

import tracer from 'dd-trace';

function dogstatsd() {
  try {
    return tracer.dogstatsd;
  } catch {
    return null;
  }
}

export const metrics = {
  increment(name, tags = {}) {
    const ds = dogstatsd();
    if (!ds) return;
    ds.increment(name, 1, tagList(tags));
  },
  timing(name, ms, tags = {}) {
    const ds = dogstatsd();
    if (!ds) return;
    ds.distribution(name, ms, tagList(tags));
  },
};

function tagList(tags) {
  return Object.entries(tags).map(([k, v]) => `${k}:${String(v).replace(/\s+/g, '_')}`);
}
```

- [ ] **Step 2: Wire in server.js**

Add import:
```js
import { metrics } from './server/metrics.js';
```

Inside `handleRun`, at the success branch:
```js
    metrics.increment('chrono.query.run', { chapter, status: 'ok' });
    metrics.timing('chrono.query.duration', Math.round(durationMs), { chapter });
```

On the DuckDB error branch:
```js
    metrics.increment('chrono.query.run', { chapter, status: 'error' });
```

On rate-limit + validator rejections, already emitting the counters via `metrics.increment('chrono.query.rejected', {...})`. Add:
- After `allowRequest` rejection:
```js
  metrics.increment('chrono.query.rejected', { reason: 'rate_limit' });
```
- After `validateSql` rejection (replace existing `log.warn` call with both log + metric):
```js
  metrics.increment('chrono.query.rejected', { reason: 'security', chapter });
```

- [ ] **Step 3: Commit**

```bash
git add server/metrics.js server.js
git commit -m "$(cat <<'EOF'
Add custom Datadog metrics: query.run, query.duration, query.rejected

DogStatsD via dd-trace. No-op if tracer not initialized. Tags include
chapter, status, and rejection reason.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Deployment artifacts

### Task 8: Caddyfile + systemd unit + .env.example

**Files:**
- Create: `Caddyfile`
- Create: `chrono.service`
- Create: `.env.example`

- [ ] **Step 1: Create Caddyfile**

```
sequel.maxsaltonstall.com {
    encode gzip
    reverse_proxy 127.0.0.1:5173

    # Static assets get longer cache; HTML stays short.
    @static {
        path *.css *.js *.svg *.md *.parquet *.csv
    }
    header @static Cache-Control "public, max-age=3600"
    header / Cache-Control "public, max-age=60"

    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

Caddy auto-provisions Let's Encrypt TLS for the domain on first start.

- [ ] **Step 2: Create chrono.service**

```
[Unit]
Description=Chrono Consulting SQL game
After=network.target

[Service]
Type=simple
User=chrono
WorkingDirectory=/opt/chrono/app
EnvironmentFile=/opt/chrono/app/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/chrono

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Create .env.example**

```bash
# Public port the Node server listens on (Caddy proxies to this)
PORT=5173

# Datadog — fill with real values on the instance. Do NOT commit .env.
DD_API_KEY=REPLACE_ME_WITH_DATADOG_API_KEY
DD_SITE=datadoghq.com
DD_SERVICE=chrono-consulting
DD_ENV=prod
DD_VERSION=0.1.0
DD_TRACE_ENABLED=true
DD_LOGS_INJECTION=true
```

Add `.env` to `.gitignore`:

```
.env
```

(Check current `.gitignore`; only add the line if not already present.)

- [ ] **Step 4: Commit**

```bash
git add Caddyfile chrono.service .env.example .gitignore
git commit -m "$(cat <<'EOF'
Add deployment artifacts: Caddyfile, systemd unit, .env template

Caddyfile auto-provisions Let's Encrypt for sequel.maxsaltonstall.com
and reverse-proxies to localhost:5173. systemd unit runs Node as an
unprivileged 'chrono' user with hardening flags. .env.example shows
the required Datadog config; .env is gitignored.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Provisioning script + deploy.md runbook

**Files:**
- Create: `deploy/provision.sh`
- Create: `deploy/update.sh`
- Create: `docs/deploy.md`

- [ ] **Step 1: Create deploy/provision.sh**

```bash
#!/usr/bin/env bash
# One-shot provisioning script for a fresh Ubuntu 24.04 Lightsail instance.
# Run as root (or via `sudo -i`). Expects /opt/chrono/app to exist and
# contain the repo checkout before running this script.

set -euo pipefail

echo "==> Install base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "==> Install Node 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Install Caddy"
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

echo "==> Install Datadog Agent"
if [ -z "${DD_API_KEY:-}" ]; then
  echo "DD_API_KEY must be exported before running (e.g. export DD_API_KEY=...)"
  exit 1
fi
DD_SITE=${DD_SITE:-datadoghq.com}
bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"

echo "==> Create chrono user"
id -u chrono >/dev/null 2>&1 || useradd --system --home /opt/chrono --shell /usr/sbin/nologin chrono
mkdir -p /opt/chrono /var/log/caddy
chown -R chrono:chrono /opt/chrono

echo "==> Install app dependencies"
cd /opt/chrono/app
sudo -u chrono npm install --omit=dev

echo "==> Configure Caddy"
cp /opt/chrono/app/Caddyfile /etc/caddy/Caddyfile
systemctl restart caddy

echo "==> Configure systemd for the Node app"
cp /opt/chrono/app/chrono.service /etc/systemd/system/chrono.service
systemctl daemon-reload
systemctl enable chrono
systemctl start chrono

echo "==> Configure Datadog log forwarding"
cp /opt/chrono/app/deploy/datadog-agent.yaml /etc/datadog-agent/conf.d/chrono.d/conf.yaml 2>/dev/null || \
  mkdir -p /etc/datadog-agent/conf.d/chrono.d && \
  cp /opt/chrono/app/deploy/datadog-agent.yaml /etc/datadog-agent/conf.d/chrono.d/conf.yaml
systemctl restart datadog-agent

echo "==> Provisioning done"
systemctl status chrono --no-pager
systemctl status caddy --no-pager
```

- [ ] **Step 2: Create deploy/update.sh**

```bash
#!/usr/bin/env bash
# Pull latest code and restart. Run from the app directory on the server.
set -euo pipefail

cd /opt/chrono/app
sudo -u chrono git pull
sudo -u chrono npm install --omit=dev
systemctl restart chrono
echo "==> chrono restarted. Tail logs with: journalctl -u chrono -f"
```

- [ ] **Step 3: Create deploy/datadog-agent.yaml**

```yaml
# Datadog Agent — collect chrono logs + APM
logs:
  - type: journald
    source: chrono
    service: chrono-consulting
    include_units:
      - chrono.service
apm_config:
  enabled: true
  apm_non_local_traffic: false
```

Also need to set `logs_enabled: true` in `/etc/datadog-agent/datadog.yaml`; the provision script handles this manually below — add that step.

Update `deploy/provision.sh` to append the log-enabling step. Near the "Configure Datadog log forwarding" section, add:

```bash
# Ensure logs_enabled is true in the agent config
if ! grep -q "^logs_enabled:" /etc/datadog-agent/datadog.yaml; then
  echo "logs_enabled: true" >> /etc/datadog-agent/datadog.yaml
else
  sed -i 's/^logs_enabled: false/logs_enabled: true/' /etc/datadog-agent/datadog.yaml
fi
```

- [ ] **Step 4: Create docs/deploy.md**

```markdown
# Chrono Consulting — Deploy Runbook

Public URL: `https://sequel.maxsaltonstall.com`

This runbook covers the one-time deploy to AWS Lightsail and ongoing updates.

## Prerequisites

- AWS account with Lightsail enabled.
- A Datadog account. Grab an API key from [Organization Settings → API Keys](https://app.datadoghq.com/organization-settings/api-keys). Keep it somewhere safe.
- DNS control for `maxsaltonstall.com`.
- This repo pushed to a GitHub repo you own (e.g. `maxsaltonstall/sqllearning`).

---

## Step 1 — Create the Lightsail instance

1. [Lightsail console](https://lightsail.aws.amazon.com/) → Create instance.
2. Region: pick closest to you (e.g. `us-east-1a`).
3. Platform: **Linux/Unix**. Blueprint: **OS Only → Ubuntu 24.04 LTS**.
4. Plan: **$5 USD / month** (1 GB RAM, 2 vCPU, 40 GB SSD) — plenty for this workload.
5. Name: `chrono-consulting`.
6. Create.

After the instance is running:
- **Networking → Attach static IP** → name it `chrono-ip`, attach.
- **Networking → IPv4 firewall** → add HTTPS (TCP 443) and HTTP (TCP 80) to the allow list (SSH/22 should already be there).

Copy down the static IP — you'll need it for DNS.

---

## Step 2 — SSH in and clone the repo

```bash
ssh -i <your-lightsail-key.pem> ubuntu@<static-ip>
```

```bash
sudo mkdir -p /opt/chrono
sudo chown ubuntu:ubuntu /opt/chrono
cd /opt/chrono
git clone https://github.com/maxsaltonstall/sqllearning.git app
cd app
```

---

## Step 3 — Create the .env file

```bash
cp .env.example .env
nano .env
```

Fill in your real `DD_API_KEY`. The other defaults are fine. Save.

Restrict its permissions:
```bash
chmod 600 .env
```

---

## Step 4 — Run the provisioning script

```bash
cd /opt/chrono/app
export DD_API_KEY=$(grep DD_API_KEY .env | cut -d= -f2)
sudo -E bash deploy/provision.sh
```

This installs Node, Caddy, the Datadog Agent, creates the `chrono` user, wires up systemd, and starts everything. Takes 3–5 minutes.

When it completes:
```bash
systemctl status chrono
systemctl status caddy
systemctl status datadog-agent
```

All three should be `active (running)`.

Quick sanity check: `curl -I http://127.0.0.1:5173/health` should return `200`.

---

## Step 5 — DNS

Add this record at your DNS provider (where `maxsaltonstall.com` is hosted — the instructions below are generic):

```
Type: A
Name: sequel
Value: <lightsail-static-ip>
TTL:  300 (5 minutes) — can go higher later
```

Wait 1–5 minutes. Test:
```bash
dig sequel.maxsaltonstall.com
```

Once the A record is visible globally, Caddy will automatically attempt to provision a Let's Encrypt certificate on the next request. Watch:
```bash
journalctl -u caddy -f
```

You'll see it talking to ACME. Give it 30–60 seconds after the first HTTP request.

---

## Step 6 — Verify the live site

Open `https://sequel.maxsaltonstall.com` in a browser. You should see Chapter 1 load. Solve a puzzle. Check Datadog:

- **APM**: [app.datadoghq.com/apm/services](https://app.datadoghq.com/apm/services) — look for `chrono-consulting`.
- **Logs**: [app.datadoghq.com/logs](https://app.datadoghq.com/logs) — filter `service:chrono-consulting`.
- **Custom metrics**: search for `chrono.query.run`.

---

## Ongoing deploys

After you push changes to GitHub:

```bash
ssh ubuntu@<static-ip>
cd /opt/chrono/app
sudo bash deploy/update.sh
```

That's it. Systemd restarts the Node process; Caddy keeps serving.

---

## Troubleshooting

- **502 Bad Gateway**: Node isn't running. `systemctl status chrono` → `journalctl -u chrono -n 100`.
- **Caddy TLS error**: DNS may not be propagated yet. Wait 5 minutes and try again. Check `journalctl -u caddy -n 100`.
- **No logs in Datadog**: verify `logs_enabled: true` in `/etc/datadog-agent/datadog.yaml` and `systemctl restart datadog-agent`.
- **Rate limited immediately**: someone's hitting /run fast. Log shows `query.rate_limited` events. Adjust capacity in `server/ratelimit.js`.

---

## Shutting down

Remove the instance + static IP via the Lightsail console. Delete the DNS record.
```

- [ ] **Step 5: Make scripts executable**

```bash
chmod +x deploy/provision.sh deploy/update.sh
```

- [ ] **Step 6: Commit**

```bash
git add deploy/ docs/deploy.md
git commit -m "$(cat <<'EOF'
Add Lightsail provisioning script, update script, and deploy runbook

docs/deploy.md walks through Lightsail setup, DNS, Caddy TLS, and
Datadog wiring end to end. provision.sh is a one-shot that installs
Node, Caddy, the Datadog Agent, creates the chrono user, and starts
everything. update.sh is the git-pull-and-restart routine for ongoing
deploys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — README + final verification

### Task 10: Update README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Production section to README.md**

Append to `README.md`:

```markdown
## Production

The game runs in production at `https://sequel.maxsaltonstall.com` on AWS Lightsail with Caddy (TLS) + systemd (process) + Datadog Agent (observability).

Full deploy runbook: [`docs/deploy.md`](docs/deploy.md).
```

- [ ] **Step 2: Full verification**

```bash
npm test
npm run validate-content
npm run test:e2e
```

All three should pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
README: link to production deploy runbook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Tag**

```bash
git tag -a milestone-ship -m "Milestone Ship: production hardening + Datadog + Lightsail deploy runbook"
```

---

## Hand-off to Max

After Task 10 is complete, the plan ends. Tell Max:

1. **Review the commits.** Push the branch anywhere it's useful for review.
2. **Create GitHub repo.** Go to github.com → New repository → `maxsaltonstall/sqllearning`, private or public. Don't add a README/license (the local repo already has them).
3. **Add remote and push:**
   ```bash
   cd /Users/max.saltonstall/sqllearning
   git remote add origin https://github.com/maxsaltonstall/sqllearning.git
   git branch -M main
   git push -u origin main
   git push origin milestone-ship
   ```
4. **Follow `docs/deploy.md`.** It's self-contained.
5. **After DNS + Caddy pick up TLS**, share `https://sequel.maxsaltonstall.com` with playtesters.

---

## Definition of Done

- [ ] All 10 tasks checked off.
- [ ] `npm test` passes (+ new ratelimit unit tests).
- [ ] `npm run test:e2e` 5/5 green.
- [ ] `npm run validate-content` passes.
- [ ] Fresh git repo created with clean initial commit, all plan tasks committed on top.
- [ ] `milestone-ship` tag exists.
- [ ] Max has the runbook and the list of manual steps.

## Out of scope

- Backup strategy (no persistent state beyond the code/CSV — re-deploy = full recovery).
- CI/CD with auto-deploy from GitHub (deferred — `update.sh` is enough for a personal project).
- Multi-region failover / autoscaling.
- RUM (browser Real User Monitoring) instrumentation — could add later to see client-side puzzle solve rates.
- Email/Slack alerts on Datadog signals — configure in the Datadog UI after the dashboards are up.
