# Datadog Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end Datadog instrumentation: browser RUM (with session replay + custom actions), game-specific server metrics via a new `/event` endpoint, and a custom APM span on `/run` correlated with RUM sessions.

**Architecture:** Three independently-deployable groups of changes, sequenced as PR 1 (server-side: span + `/event` + metrics) → PR 2 (RUM bootstrap: `/config` + `src/rum.js` + CSP) → PR 3 (frontend custom actions wired into puzzle/hint/chapter flows). Each PR's tasks end with a commit. Group checkpoints mark PR boundaries.

**Tech Stack:** Node.js 20+ (no build step), `dd-trace` v5 (server APM + DogStatsD), `@datadog/browser-rum` (CDN, dynamic-imported), Node test runner, Playwright.

**Reference:** `docs/superpowers/specs/2026-05-21-datadog-instrumentation-design.md`

---

## File Map

**Server (PR 1)**
- Modify: `server.js` — add `handleEvent`, wrap `handleRun` body in `tracer.trace`, route `POST /event` and `GET /config`, extend CSP for RUM
- Create: `server/events.js` — pure allow-list validator + metric-emission table
- Modify: `server/metrics.js` — no API change (verify existing module remains the surface)

**Tests (PR 1)**
- Create: `tests/events-validate.test.js` — pure validator unit tests
- Create: `tests/event-endpoint.test.js` — HTTP integration tests for `/event`
- Create: `tests/run-span.test.js` — `chrono.query` span tag assertions
- Modify: `tests/run-endpoint.test.js` — small addition for `/event` rate-limit interaction (optional)

**Server (PR 2)**
- Modify: `server.js` — add `GET /config` route, extend CSP for `https://www.datadoghq-browser-agent.com` (script-src), `https://browser-intake-*.datadoghq.com` (connect-src), and `worker-src 'self' blob:`

**Tests (PR 2)**
- Create: `tests/config-endpoint.test.js` — env var presence / absence behavior

**Client (PR 2)**
- Create: `src/rum.js` — `/config` fetch + dynamic SDK import + init + replay start + `rumAction` / `rumError` wrappers (no-op when disabled)
- Modify: `src/main.js` — single import line for `./rum.js`

**Client (PR 3)**
- Create: `src/telemetry.js` — `emit(type, payload)` wrapper that fans out to `rumAction` and `POST /event`
- Modify: `src/puzzle.js` — emit `puzzle.attempt`, `puzzle.solved`, `puzzle.failed`, `hint.used`
- Modify: `src/main.js` — emit `chapter.started`, `chapter.completed`

**Tests (PR 3)**
- Create: `tests/telemetry.test.js` — `emit` calls `rumAction` and posts `/event` with allow-listed shape; swallows errors

---

# PR 1 — Server: custom span + `/event` + game metrics

## Task 1: Pure allow-list validator

**Files:**
- Create: `server/events.js`
- Test: `tests/events-validate.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/events-validate.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../server/events.js';

test('puzzle.attempt requires chapter and puzzle', () => {
  assert.deepEqual(
    validateEvent({ type: 'puzzle.attempt', chapter: 'ch3-census', puzzle: 'p4' }),
    { ok: true, type: 'puzzle.attempt', chapter: 'ch3-census', puzzle: 'p4' },
  );
  assert.equal(validateEvent({ type: 'puzzle.attempt', chapter: 'ch3-census' }).ok, false);
  assert.equal(validateEvent({ type: 'puzzle.attempt', puzzle: 'p4' }).ok, false);
});

test('puzzle.solved requires attempts and clamps to [1,999]', () => {
  const ok = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.attempts, 3);

  const clampHigh = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 50000 });
  assert.equal(clampHigh.attempts, 999);

  const clampLow = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 0 });
  assert.equal(clampLow.attempts, 1);

  const missing = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4' });
  assert.equal(missing.ok, false);
});

test('puzzle.failed requires reason from enum', () => {
  for (const r of ['wrong_result', 'sql_error', 'security_rejected', 'timeout']) {
    assert.equal(validateEvent({ type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4', reason: r }).ok, true);
  }
  assert.equal(validateEvent({ type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4', reason: 'nope' }).ok, false);
  assert.equal(validateEvent({ type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4' }).ok, false);
});

test('hint.used requires chapter and puzzle', () => {
  assert.equal(validateEvent({ type: 'hint.used', chapter: 'ch3', puzzle: 'p4' }).ok, true);
  assert.equal(validateEvent({ type: 'hint.used', chapter: 'ch3' }).ok, false);
});

test('chapter.started / chapter.completed require chapter only', () => {
  assert.equal(validateEvent({ type: 'chapter.started', chapter: 'ch3' }).ok, true);
  assert.equal(validateEvent({ type: 'chapter.completed', chapter: 'ch3' }).ok, true);
  assert.equal(validateEvent({ type: 'chapter.started' }).ok, false);
});

test('unknown type rejected with reason', () => {
  const r = validateEvent({ type: 'nope.nope', chapter: 'ch3' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_type');
});

test('invalid chapter regex rejected', () => {
  assert.equal(validateEvent({ type: 'chapter.started', chapter: 'BAD CHAPTER' }).ok, false);
});

test('invalid puzzle regex rejected', () => {
  assert.equal(validateEvent({ type: 'puzzle.attempt', chapter: 'ch3', puzzle: 'P 4!' }).ok, false);
});

test('non-object input rejected', () => {
  assert.equal(validateEvent(null).ok, false);
  assert.equal(validateEvent('x').ok, false);
  assert.equal(validateEvent({}).ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/events-validate.test.js`
Expected: FAIL — `validateEvent` not exported.

- [ ] **Step 3: Implement `server/events.js`**

```javascript
const CHAPTER_RE = /^[a-z0-9-]+$/;
const PUZZLE_RE  = /^[a-z0-9-]+$/;
const REASONS    = new Set(['wrong_result', 'sql_error', 'security_rejected', 'timeout']);

function bad(reason) { return { ok: false, reason }; }

function clampAttempts(n) {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i)) return null;
  return Math.min(999, Math.max(1, i));
}

export function validateEvent(body) {
  if (!body || typeof body !== 'object') return bad('invalid_body');
  const { type, chapter, puzzle, attempts, reason } = body;

  if (typeof chapter !== 'string' || !CHAPTER_RE.test(chapter)) return bad('invalid_field');

  switch (type) {
    case 'puzzle.attempt':
    case 'hint.used': {
      if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) return bad('invalid_field');
      return { ok: true, type, chapter, puzzle };
    }
    case 'puzzle.solved': {
      if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) return bad('invalid_field');
      const a = clampAttempts(attempts);
      if (a === null) return bad('invalid_field');
      return { ok: true, type, chapter, puzzle, attempts: a };
    }
    case 'puzzle.failed': {
      if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) return bad('invalid_field');
      if (typeof reason !== 'string' || !REASONS.has(reason)) return bad('invalid_field');
      return { ok: true, type, chapter, puzzle, reason };
    }
    case 'chapter.started':
    case 'chapter.completed': {
      return { ok: true, type, chapter };
    }
    default:
      return bad('unknown_type');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/events-validate.test.js`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/events.js tests/events-validate.test.js
git commit -m "feat(server): allow-list validator for /event payloads"
```

---

## Task 2: Metric-emission table for events

**Files:**
- Modify: `server/events.js` — add `emitMetricFor(validated, metrics)`
- Test: `tests/events-validate.test.js` — extend with emission cases

- [ ] **Step 1: Write the failing tests** (extend the existing file)

Append to `tests/events-validate.test.js`:

```javascript
import { emitMetricFor } from '../server/events.js';

function fakeMetrics() {
  const calls = [];
  return {
    calls,
    increment(name, tags) { calls.push({ kind: 'increment', name, tags }); },
    timing(name, ms, tags) { calls.push({ kind: 'timing', name, ms, tags }); },
  };
}

test('emitMetricFor: puzzle.attempt emits counter', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'puzzle.attempt', chapter: 'ch3', puzzle: 'p4' }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.puzzle.attempt', tags: { chapter: 'ch3', puzzle: 'p4' } },
  ]);
});

test('emitMetricFor: puzzle.solved emits counter + distribution', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 3 }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.puzzle.solved', tags: { chapter: 'ch3', puzzle: 'p4' } },
    { kind: 'timing', name: 'chrono.puzzle.attempts_to_solve', ms: 3, tags: { chapter: 'ch3', puzzle: 'p4' } },
  ]);
});

test('emitMetricFor: puzzle.failed includes reason tag', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4', reason: 'wrong_result' }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.puzzle.failed', tags: { chapter: 'ch3', puzzle: 'p4', reason: 'wrong_result' } },
  ]);
});

test('emitMetricFor: hint.used emits counter', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'hint.used', chapter: 'ch3', puzzle: 'p4' }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.hint.used', tags: { chapter: 'ch3', puzzle: 'p4' } },
  ]);
});

test('emitMetricFor: chapter.started / chapter.completed each emit one counter', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'chapter.started', chapter: 'ch3' }, m);
  emitMetricFor({ ok: true, type: 'chapter.completed', chapter: 'ch3' }, m);
  assert.equal(m.calls.length, 2);
  assert.equal(m.calls[0].name, 'chrono.chapter.started');
  assert.equal(m.calls[1].name, 'chrono.chapter.completed');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/events-validate.test.js`
Expected: FAIL — `emitMetricFor` not exported.

- [ ] **Step 3: Implement `emitMetricFor`**

Append to `server/events.js`:

```javascript
export function emitMetricFor(validated, metrics) {
  if (!validated || !validated.ok) return;
  const { type, chapter, puzzle, attempts, reason } = validated;
  switch (type) {
    case 'puzzle.attempt':
      metrics.increment('chrono.puzzle.attempt', { chapter, puzzle });
      return;
    case 'puzzle.solved':
      metrics.increment('chrono.puzzle.solved', { chapter, puzzle });
      metrics.timing('chrono.puzzle.attempts_to_solve', attempts, { chapter, puzzle });
      return;
    case 'puzzle.failed':
      metrics.increment('chrono.puzzle.failed', { chapter, puzzle, reason });
      return;
    case 'hint.used':
      metrics.increment('chrono.hint.used', { chapter, puzzle });
      return;
    case 'chapter.started':
      metrics.increment('chrono.chapter.started', { chapter });
      return;
    case 'chapter.completed':
      metrics.increment('chrono.chapter.completed', { chapter });
      return;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/events-validate.test.js`
Expected: 14 tests pass (9 from Task 1 + 5 from Task 2).

- [ ] **Step 5: Commit**

```bash
git add server/events.js tests/events-validate.test.js
git commit -m "feat(server): metric emission table for game events"
```

---

## Task 3: `POST /event` endpoint

**Files:**
- Modify: `server.js`
- Test: `tests/event-endpoint.test.js`

- [ ] **Step 1: Write the failing test**

`tests/event-endpoint.test.js` (mirrors the pattern in `tests/run-endpoint.test.js`):

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let proc;
let port;

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

async function postEvent(body) {
  return fetch(`http://localhost:${port}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST /event accepts a valid puzzle.solved and returns 204', async () => {
  const res = await postEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 2 });
  assert.equal(res.status, 204);
});

test('POST /event rejects unknown type', async () => {
  const res = await postEvent({ type: 'nope.nope', chapter: 'ch3' });
  assert.equal(res.status, 400);
});

test('POST /event rejects malformed chapter', async () => {
  const res = await postEvent({ type: 'chapter.started', chapter: 'BAD CHAPTER' });
  assert.equal(res.status, 400);
});

test('POST /event rejects empty body', async () => {
  const res = await postEvent('');
  assert.equal(res.status, 400);
});

test('GET /event returns 405', async () => {
  const res = await fetch(`http://localhost:${port}/event`);
  assert.equal(res.status, 405);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/event-endpoint.test.js`
Expected: FAIL — endpoint not wired; first test returns 404 or 405.

- [ ] **Step 3: Wire `/event` into `server.js`**

Add the import at the top of `server.js` alongside other server imports:

```javascript
import { validateEvent, emitMetricFor } from './server/events.js';
```

Add `handleEvent` (place it near `handleRun`):

```javascript
async function handleEvent(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';

  if (!allowRequest(ip)) {
    log.warn('event.rate_limited', { ip });
    metrics.increment('chrono.event.rejected', { reason: 'rate_limit' });
    return sendJson(res, 429, { error: 'Rate limit exceeded — slow down.' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch (err) {
    log.warn('event.body_error', { ip, reason: err.message });
    metrics.increment('chrono.event.rejected', { reason: 'invalid_body' });
    return sendJson(res, 400, { error: err.message });
  }

  const v = validateEvent(body);
  if (!v.ok) {
    log.warn('event.rejected', { ip, reason: v.reason, type: body?.type });
    metrics.increment('chrono.event.rejected', { reason: v.reason });
    return sendJson(res, 400, { error: v.reason });
  }

  emitMetricFor(v, metrics);
  res.writeHead(204).end();
}
```

Add the route in the `createServer` callback, just below the `/run` route:

```javascript
if (req.method === 'POST' && req.url === '/event') return handleEvent(req, res);
```

Method-not-allowed for `GET /event` falls through to the existing `res.writeHead(405)` default.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/event-endpoint.test.js`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/event-endpoint.test.js
git commit -m "feat(server): POST /event endpoint emitting game metrics"
```

---

## Task 4: Wrap `/run` in `chrono.query` custom span

**Files:**
- Modify: `server.js` (handleRun)
- Test: `tests/run-span.test.js`

- [ ] **Step 1: Write the failing test**

The cleanest way to test span tagging without booting a real APM agent is to stub `tracer.trace` via the existing `server/tracer.js` module. The simplest approach: spy by importing `dd-trace` directly and intercepting `tracer.trace`. Since `dd-trace` is a no-op when `DD_TRACE_ENABLED !== 'true'`, we can wire our handler to call `tracer.trace(name, fn)` regardless, and have it default to invoking `fn` immediately with a no-op span. Test that the call happens with the right name and that tags would be set.

To make this testable, expose a small `withChronoQuerySpan(fn, tag)` helper in `server.js` or in a new `server/spans.js`. To keep the change minimal, create `server/spans.js` with one wrapper.

`tests/run-span.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withChronoQuerySpan, __setTracerForTesting } from '../server/spans.js';

test('withChronoQuerySpan opens a span named chrono.query and sets supplied tags', async () => {
  const setTags = [];
  const fakeSpan = { setTag: (k, v) => setTags.push([k, v]) };
  let openedName = null;
  __setTracerForTesting({
    trace: (name, opts, fn) => {
      openedName = name;
      return fn(fakeSpan);
    },
  });

  const result = await withChronoQuerySpan(async (span) => {
    span.setTag('chapter', 'ch3');
    span.setTag('validation.ok', true);
    span.setTag('result.rows', 2);
    return 42;
  });

  assert.equal(openedName, 'chrono.query');
  assert.equal(result, 42);
  assert.deepEqual(setTags, [['chapter', 'ch3'], ['validation.ok', true], ['result.rows', 2]]);
});

test('withChronoQuerySpan re-throws and tags error', async () => {
  const setTags = [];
  const fakeSpan = { setTag: (k, v) => setTags.push([k, v]) };
  __setTracerForTesting({ trace: (name, opts, fn) => fn(fakeSpan) });

  await assert.rejects(async () => {
    await withChronoQuerySpan(async () => { throw new Error('boom'); });
  }, /boom/);
  const errTag = setTags.find(([k]) => k === 'error');
  assert.ok(errTag, 'expected error tag to be set');
});

test('withChronoQuerySpan is a no-op pass-through when tracer.trace is missing', async () => {
  __setTracerForTesting({}); // no .trace
  const result = await withChronoQuerySpan(async (span) => {
    span.setTag('chapter', 'ch3'); // must not throw
    return 'ok';
  });
  assert.equal(result, 'ok');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/run-span.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/spans.js`**

```javascript
import tracerDefault from 'dd-trace';

let _tracer = tracerDefault;

export function __setTracerForTesting(t) { _tracer = t; }

const NOOP_SPAN = { setTag() {} };

export async function withChronoQuerySpan(fn) {
  if (!_tracer || typeof _tracer.trace !== 'function') {
    return fn(NOOP_SPAN);
  }
  return _tracer.trace('chrono.query', {}, async (span) => {
    const s = span || NOOP_SPAN;
    try {
      return await fn(s);
    } catch (err) {
      try { s.setTag('error', err); } catch {}
      throw err;
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/run-span.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Wire `withChronoQuerySpan` into `handleRun`**

In `server.js`, add the import:

```javascript
import { withChronoQuerySpan } from './server/spans.js';
```

Refactor the body of `handleRun`. Replace the existing implementation of `handleRun` (the function declared `async function handleRun(req, res)`) with:

```javascript
async function handleRun(req, res) {
  const startNs = process.hrtime.bigint();
  const ip = req.socket.remoteAddress || 'unknown';

  if (!allowRequest(ip)) {
    log.warn('query.rate_limited', { ip });
    metrics.increment('chrono.query.rejected', { reason: 'rate_limit' });
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

  await withChronoQuerySpan(async (span) => {
    span.setTag('chapter', chapter);
    span.setTag('sql.length', sql.length);

    const translated = translateBucket(translateTagFilter(translateTimeWindow(translateRate(translatePTF(translateTagJoin(sql))))));
    const validation = validateSql(translated);
    span.setTag('validation.ok', validation.ok);
    if (!validation.ok) {
      span.setTag('validation.reason', validation.error);
      log.warn('query.rejected', { ip, chapter, reason: validation.error, sql_preview: sql.slice(0, 120) });
      metrics.increment('chrono.query.rejected', { reason: 'security', chapter });
      return sendJson(res, 400, { error: validation.error });
    }

    try {
      const result = await runQuery(chapter, translated);
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      span.setTag('result.rows', result.rows?.length ?? 0);
      span.setTag('result.truncated', !!result.truncated);
      log.info('query.ok', {
        ip, chapter,
        rows: result.rows?.length ?? 0,
        truncated: !!result.truncated,
        duration_ms: Math.round(durationMs),
      });
      metrics.increment('chrono.query.run', { chapter, status: 'ok' });
      metrics.timing('chrono.query.duration', Math.round(durationMs), { chapter });
      return sendJson(res, 200, result);
    } catch (err) {
      span.setTag('error', err);
      log.error('query.duckdb_error', { ip, chapter, reason: err.message });
      metrics.increment('chrono.query.run', { chapter, status: 'error' });
      return sendJson(res, 200, { error: err.message });
    }
  });
}
```

- [ ] **Step 6: Run all tests to verify no regression**

Run: `npm test`
Expected: all pre-existing tests + new tests pass. The existing `tests/run-endpoint.test.js` should still pass — `/run` behavior is unchanged.

- [ ] **Step 7: Commit**

```bash
git add server/spans.js tests/run-span.test.js server.js
git commit -m "feat(server): wrap /run in chrono.query custom APM span"
```

---

### Checkpoint: PR 1 ready

After Tasks 1–4, you have a deployable PR. Optional: open a draft PR titled "Datadog: custom /run span + /event endpoint" with the four commits.

Manual verification once deployed to staging or prod:
- In APM, find a recent `chrono.query` span; confirm `chapter`, `result.rows`, `validation.ok` tags.
- In Metrics Explorer, run `chrono.event.rejected{*}` after sending a curl with a bogus type — should appear.

---

# PR 2 — RUM bootstrap (`/config` + `src/rum.js` + CSP)

## Task 5: `GET /config` endpoint

**Files:**
- Modify: `server.js`
- Test: `tests/config-endpoint.test.js`

- [ ] **Step 1: Write the failing test**

`tests/config-endpoint.test.js`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

function startServer(env) {
  const port = 5470 + Math.floor(Math.random() * 100);
  const proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { proc, port };
}

async function waitReady(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start');
}

test('GET /config returns enabled:false when RUM env vars missing', async () => {
  const { proc, port } = startServer({
    DD_RUM_APPLICATION_ID: '', DD_RUM_CLIENT_TOKEN: '',
  });
  try {
    await waitReady(port);
    const res = await fetch(`http://localhost:${port}/config`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, { enabled: false });
  } finally { proc.kill(); }
});

test('GET /config returns full config when RUM env vars present', async () => {
  const { proc, port } = startServer({
    DD_RUM_APPLICATION_ID: 'app-id-123',
    DD_RUM_CLIENT_TOKEN: 'tok-456',
    DD_SITE: 'datadoghq.com',
    DD_SERVICE: 'chrono-consulting',
    DD_ENV: 'staging',
    DD_VERSION: 'v1.2.3',
  });
  try {
    await waitReady(port);
    const res = await fetch(`http://localhost:${port}/config`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.applicationId, 'app-id-123');
    assert.equal(json.clientToken, 'tok-456');
    assert.equal(json.site, 'datadoghq.com');
    assert.equal(json.service, 'chrono-consulting');
    assert.equal(json.env, 'staging');
    assert.equal(json.version, 'v1.2.3');
  } finally { proc.kill(); }
});

test('POST /config returns 405', async () => {
  const { proc, port } = startServer({});
  try {
    await waitReady(port);
    const res = await fetch(`http://localhost:${port}/config`, { method: 'POST' });
    assert.equal(res.status, 405);
  } finally { proc.kill(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/config-endpoint.test.js`
Expected: FAIL — `/config` returns 404.

- [ ] **Step 3: Add `/config` route in `server.js`**

Add `handleConfig` near `handleEvent`:

```javascript
function handleConfig(req, res) {
  const applicationId = process.env.DD_RUM_APPLICATION_ID || '';
  const clientToken   = process.env.DD_RUM_CLIENT_TOKEN || '';
  if (!applicationId || !clientToken) {
    return sendJson(res, 200, { enabled: false });
  }
  return sendJson(res, 200, {
    applicationId,
    clientToken,
    site:    process.env.DD_SITE    || 'datadoghq.com',
    service: process.env.DD_SERVICE || 'chrono-consulting',
    env:     process.env.DD_ENV     || 'dev',
    version: process.env.DD_VERSION || 'unknown',
  });
}
```

In the `createServer` callback, add the GET route just above the static-file fallback:

```javascript
if (req.method === 'GET' && req.url === '/config') return handleConfig(req, res);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/config-endpoint.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/config-endpoint.test.js
git commit -m "feat(server): GET /config exposes RUM bootstrap settings"
```

---

## Task 6: Extend CSP for RUM CDN and intake

**Files:**
- Modify: `server.js` (CSP header in `serveStatic`)

- [ ] **Step 1: Update CSP**

In `server.js`, locate the CSP construction inside `serveStatic`. Replace the existing `headers['Content-Security-Policy'] = …` assignment with:

```javascript
headers['Content-Security-Policy'] =
  "default-src 'self'; " +
  "script-src 'self' https://esm.sh https://www.datadoghq-browser-agent.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "connect-src 'self' https://esm.sh https://browser-intake-datadoghq.com https://browser-intake-datadoghq.eu https://browser-intake-us3-datadoghq.com https://browser-intake-us5-datadoghq.com https://browser-intake-ap1-datadoghq.com; " +
  "font-src 'self' data:; " +
  "worker-src 'self' blob:; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";
```

The intake hosts cover all current Datadog sites; the SDK uses the one matching `site` from `init()`. CSP only allows what the SDK might call — it doesn't *force* calls to all of them.

- [ ] **Step 2: Manual sanity check**

Run: `npm start`, then in another terminal:

```bash
curl -sI http://localhost:5173/ | grep -i content-security
```

Expected: a single CSP header that includes `https://www.datadoghq-browser-agent.com` in `script-src` and `worker-src 'self' blob:`.

- [ ] **Step 3: Run all existing tests** (the CSP change must not break anything)

Run: `npm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(server): allow RUM CDN + intake hosts and worker blobs in CSP"
```

---

## Task 7: `src/rum.js` — `/config` fetch + dynamic SDK init

**Files:**
- Create: `src/rum.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/rum.js`**

```javascript
let _rum = null;

export function rumAction(name, attrs) {
  if (!_rum) return;
  try { _rum.addAction(name, attrs); } catch {}
}

export function rumError(err, attrs) {
  if (!_rum) return;
  try { _rum.addError(err, attrs); } catch {}
}

async function loadConfig() {
  try {
    const res = await fetch('/config');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function init() {
  const cfg = await loadConfig();
  if (!cfg || cfg.enabled === false) return;
  if (!cfg.applicationId || !cfg.clientToken) return;
  try {
    const mod = await import('https://www.datadoghq-browser-agent.com/datadog-rum.js');
    const rum = mod.datadogRum || mod.default || mod;
    rum.init({
      applicationId: cfg.applicationId,
      clientToken: cfg.clientToken,
      site: cfg.site || 'datadoghq.com',
      service: cfg.service || 'chrono-consulting',
      env: cfg.env || 'dev',
      version: cfg.version || 'unknown',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 20,
      defaultPrivacyLevel: 'mask-user-input',
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      allowedTracingUrls: [window.location.origin],
    });
    if (typeof rum.startSessionReplayRecording === 'function') {
      rum.startSessionReplayRecording();
    }
    _rum = rum;
  } catch (err) {
    console.warn('RUM init skipped:', err && err.message);
  }
}

init();
```

- [ ] **Step 2: Import `rum.js` from `main.js`**

In `src/main.js`, add this import alongside the existing top-of-file imports:

```javascript
import './rum.js';
```

Place it as the last `import` in the block so it doesn't shadow any state imports.

- [ ] **Step 3: Smoke test locally (CSP-only path)**

Run: `npm start`, then open `http://localhost:5173`. Open browser DevTools console.

With no RUM env vars set in the shell: console should be clean (no errors); `/config` returns `{enabled:false}`; the dynamic import never runs.

To exercise the init path, set fake env vars and restart:

```bash
DD_RUM_APPLICATION_ID=test-app DD_RUM_CLIENT_TOKEN=test-tok DD_SITE=datadoghq.com npm start
```

Open the site. Expect a `console.warn('RUM init skipped: …')` because `test-app` won't satisfy real Datadog backend — that's fine. The point of this manual check is to confirm the SDK script loaded and CSP did not block it. Look for the CSP error pattern in the console: if you see `Refused to load … because it violates the following Content Security Policy directive`, fix CSP in Task 6 before proceeding.

If CSP is clean, proceed.

- [ ] **Step 4: Run all tests**

Run: `npm test && npm run test:e2e`
Expected: green. The Playwright smoke test still passes — `rum.js` failing softly does not break the game.

- [ ] **Step 5: Commit**

```bash
git add src/rum.js src/main.js
git commit -m "feat(client): RUM bootstrap with session replay and APM correlation"
```

---

### Checkpoint: PR 2 ready

After Tasks 5–7, you have a second deployable PR. Manual verification once deployed:
- With `DD_RUM_APPLICATION_ID` and `DD_RUM_CLIENT_TOKEN` set on Cloud Run, open the live site.
- In Datadog RUM Explorer, find the session. Confirm session replay is being recorded (≈20% sampling, so refresh a few times to land in a sampled session).
- Click a session that emitted a `/run` call → click the request → "View backend trace" should land on the `chrono.query` span.

---

# PR 3 — Frontend custom actions + `/event` calls

## Task 8: `src/telemetry.js` wrapper

**Files:**
- Create: `src/telemetry.js`
- Test: `tests/telemetry.test.js`

- [ ] **Step 1: Write the failing test**

`tests/telemetry.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub global fetch and rum module before importing the SUT.
async function loadTelemetryWith({ rumActions, fetchImpl }) {
  globalThis.fetch = fetchImpl;
  // Use a query string to bust ESM cache between test cases.
  const mod = await import(`../src/telemetry.js?case=${Math.random()}`);
  // Inject our rumAction stub by reassigning the imported reference is not possible;
  // instead we rely on telemetry.js exposing a setter for tests.
  mod.__setRumActionForTesting(rumActions);
  return mod;
}

test('emit fans out to rumAction and POST /event', async () => {
  const rumActions = [];
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 204 };
  };
  const { emit } = await loadTelemetryWith({
    rumActions: (name, attrs) => rumActions.push({ name, attrs }),
    fetchImpl,
  });

  await emit('puzzle.solved', { chapter: 'ch3', puzzle: 'p4', attempts: 3 });

  assert.deepEqual(rumActions, [
    { name: 'puzzle.solved', attrs: { chapter: 'ch3', puzzle: 'p4', attempts: 3 } },
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/event');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 3,
  });
});

test('emit swallows fetch errors', async () => {
  const fetchImpl = async () => { throw new Error('network'); };
  const { emit } = await loadTelemetryWith({
    rumActions: () => {},
    fetchImpl,
  });
  await assert.doesNotReject(emit('hint.used', { chapter: 'ch3', puzzle: 'p4' }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/telemetry.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/telemetry.js`**

```javascript
import { rumAction as defaultRumAction } from './rum.js';

let _rumAction = defaultRumAction;
export function __setRumActionForTesting(fn) { _rumAction = fn; }

export async function emit(type, payload = {}) {
  try { _rumAction(type, payload); } catch {}
  try {
    await fetch('/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    });
  } catch {
    /* telemetry must never break gameplay */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/telemetry.test.js`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry.js tests/telemetry.test.js
git commit -m "feat(client): telemetry.emit fans out to RUM + /event"
```

---

## Task 9: Wire `puzzle.attempt` / `puzzle.solved` / `puzzle.failed` in `src/puzzle.js`

**Files:**
- Modify: `src/puzzle.js`

Context: `handleSubmit` in `src/puzzle.js` is the only place that processes a submit. The attempt event fires unconditionally on submit. `puzzle.solved` fires when `cmp.status === 'match'`. `puzzle.failed` fires in the wrong-result, sql-error, and security-rejected branches.

Reason mapping:
- `actual.error` returned from `/run` (DuckDB error or security 400 → server replies `{error: ...}` with 200 or 400) → `puzzle.failed` reason `sql_error` (covers both DuckDB syntax errors and validator rejections; server doesn't currently distinguish in the body the client receives — `sql_error` is a fair label here)
- `cmp.status !== 'match'` → `puzzle.failed` reason `wrong_result`

There is no client-observable `timeout` reason today (the server doesn't return one), so `timeout` is reserved for future wiring; do not emit it from this task.

- [ ] **Step 1: Add the import**

At the top of `src/puzzle.js`, add:

```javascript
import { emit } from './telemetry.js';
```

- [ ] **Step 2: Track attempt count locally**

Inside `playPuzzle`, near the `let solved = false;` line, add:

```javascript
let attemptCount = 0;
```

- [ ] **Step 3: Emit `puzzle.attempt` on every submit**

In `handleSubmit`, immediately after the `busy = true;` line and before the try block (or at the top of the try block), add:

```javascript
attemptCount += 1;
emit('puzzle.attempt', { chapter: chapterId, puzzle: puzzle.id });
```

- [ ] **Step 4: Emit `puzzle.failed` on `actual.error`**

In the existing block:

```javascript
if (actual.error) {
  const h = selectHint(puzzle.hints, 'error');
  pushHint(h.text);
  return;
}
```

Add the emit before the `return`:

```javascript
if (actual.error) {
  emit('puzzle.failed', { chapter: chapterId, puzzle: puzzle.id, reason: 'sql_error' });
  const h = selectHint(puzzle.hints, 'error');
  pushHint(h.text);
  return;
}
```

- [ ] **Step 5: Emit `puzzle.solved` and `puzzle.failed` (wrong_result) in the comparison branch**

Replace the existing comparison block:

```javascript
const cmp = compareRows(actual.rows, expected.rows, !!puzzle.expected.order_sensitive);
if (cmp.status === 'match') {
  pushSuccess({ speaker: puzzle.success.speaker, text: puzzle.success.text });
  solved = true;
  onSolved?.();
  renderNextButton();
} else {
  const h = selectHint(puzzle.hints, cmp.status);
  pushHint(h.text);
}
```

With:

```javascript
const cmp = compareRows(actual.rows, expected.rows, !!puzzle.expected.order_sensitive);
if (cmp.status === 'match') {
  emit('puzzle.solved', { chapter: chapterId, puzzle: puzzle.id, attempts: attemptCount });
  pushSuccess({ speaker: puzzle.success.speaker, text: puzzle.success.text });
  solved = true;
  onSolved?.();
  renderNextButton();
} else {
  emit('puzzle.failed', { chapter: chapterId, puzzle: puzzle.id, reason: 'wrong_result' });
  const h = selectHint(puzzle.hints, cmp.status);
  pushHint(h.text);
}
```

- [ ] **Step 6: Run all existing tests** (must remain green)

Run: `npm test`
Expected: green. The unit tests on pure helpers (`assembleSql`, `compareRows`, etc.) are unaffected; `playPuzzle` is DOM-driven and not unit-tested directly.

- [ ] **Step 7: Manual smoke**

Run: `npm start`. Open `http://localhost:5173`. Solve the first puzzle. In DevTools → Network, you should see at least:
- One `POST /event` with `type: "puzzle.attempt"` per click of Run.
- One `POST /event` with `type: "puzzle.solved"` on success, including `attempts`.

Each `/event` should respond 204.

- [ ] **Step 8: Commit**

```bash
git add src/puzzle.js
git commit -m "feat(client): emit puzzle.attempt/solved/failed events"
```

---

## Task 10: Wire `hint.used` in `src/puzzle.js`

**Files:**
- Modify: `src/puzzle.js`

Definition for this game: `hint.used` fires whenever a hint is *shown* in response to a wrong-result attempt (`cmp.status` is not `match` and there was no `actual.error`). Hints on error paths are already captured by `puzzle.failed{reason:sql_error}`, so we keep `hint.used` to the wrong-result branch to avoid double-counting.

- [ ] **Step 1: Emit `hint.used` in the wrong-result branch**

In `handleSubmit`, in the `else` branch that already calls `pushHint(h.text)` (the same block edited in Task 9 step 5), add the emit *before* `pushHint`:

```javascript
} else {
  emit('puzzle.failed', { chapter: chapterId, puzzle: puzzle.id, reason: 'wrong_result' });
  emit('hint.used', { chapter: chapterId, puzzle: puzzle.id });
  const h = selectHint(puzzle.hints, cmp.status);
  pushHint(h.text);
}
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: green.

- [ ] **Step 3: Manual smoke**

Run: `npm start`. Submit a wrong answer to puzzle 1. In Network: expect `puzzle.attempt`, `puzzle.failed{reason:wrong_result}`, and `hint.used` in that order.

- [ ] **Step 4: Commit**

```bash
git add src/puzzle.js
git commit -m "feat(client): emit hint.used on wrong-result attempts"
```

---

## Task 11: Wire `chapter.started` / `chapter.completed` in `src/main.js`

**Files:**
- Modify: `src/main.js`

Definition:
- `chapter.started` fires once per chapter, when the chapter's first puzzle is opened — i.e. when `puzzleId === chapter.puzzle_ids[0]`. This already gates the boss intro in `runCurrent`; reuse that gate.
- `chapter.completed` fires when the player finishes the last puzzle in a chapter. In `wireNextButton`, this happens in the `else` branch of `if (next)` — the path that pushes the outro.

- [ ] **Step 1: Add the import**

At the top of `src/main.js`, add:

```javascript
import { emit } from './telemetry.js';
```

- [ ] **Step 2: Emit `chapter.started` in `runCurrent`**

Locate this block in `runCurrent`:

```javascript
if (puzzleId === chapter.puzzle_ids[0]) {
  pushBubble({ speaker: 'carol', text: chapter.boss_intro });
}
```

Add the emit:

```javascript
if (puzzleId === chapter.puzzle_ids[0]) {
  emit('chapter.started', { chapter: chapterId });
  pushBubble({ speaker: 'carol', text: chapter.boss_intro });
}
```

- [ ] **Step 3: Emit `chapter.completed` in `wireNextButton`**

Locate the `else` branch in `wireNextButton`:

```javascript
} else {
  pushBubble({ speaker: 'carol', text: chapter.outro });
  const nextCh = nextChapterId(state.currentChapterId);
```

Add the emit at the top of that branch:

```javascript
} else {
  emit('chapter.completed', { chapter: state.currentChapterId });
  pushBubble({ speaker: 'carol', text: chapter.outro });
  const nextCh = nextChapterId(state.currentChapterId);
```

- [ ] **Step 4: Run all tests**

Run: `npm test && npm run test:e2e`
Expected: green.

- [ ] **Step 5: Manual smoke**

Run: `npm start`. Clear localStorage (`localStorage.removeItem('chronoConsultingState-v1')` in DevTools console). Reload — expect `POST /event` with `chapter.started`. Solve every puzzle in chapter 1 and click Next past the last — expect `chapter.completed` followed by `chapter.started` for chapter 2.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat(client): emit chapter.started and chapter.completed"
```

---

### Checkpoint: PR 3 ready

Manual verification once deployed:
- Open the live site, solve a puzzle. In RUM Explorer, find the session. Confirm the custom actions appear in the session timeline: `chapter.started`, `puzzle.attempt`, `puzzle.solved`.
- In Metrics Explorer, build a quick view: `count_nonzero(chrono.puzzle.solved{*}) by {chapter, puzzle}` — should show the puzzle you just solved.
- Click a `/run` resource in the RUM session and confirm "View backend trace" lands on the `chrono.query` span.

---

# Plan-level verification

After all three checkpoints:

- [ ] **All unit + integration tests pass**

Run: `npm test`

- [ ] **E2E smoke passes**

Run: `npm run test:e2e`

- [ ] **No CSP violations in browser console with RUM enabled**

Run with fake-but-syntactically-valid env vars; refresh the live URL; check console.

- [ ] **Deployed telemetry sanity check**

On staging or prod:
- RUM session visible and replaying.
- `chrono.query` span present in APM with full tag set.
- All seven `chrono.*` event metrics show up in Metrics Explorer after solving one puzzle in one chapter.
- RUM → APM click-through works.
