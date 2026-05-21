# Datadog instrumentation — end-to-end design

**Date:** 2026-05-21
**Scope:** Browser RUM (with session replay + custom actions), game-specific server metrics via a new `/event` endpoint, and a custom APM span on `/run`. RUM sessions are correlated with backend traces.
**Out of scope:** Dashboards / monitors / SLOs, leaderboard-grade anti-cheat on reported outcomes, replay privacy review beyond SDK defaults, load testing of `/event`.

## Goals

1. See real user sessions on the live game, including page errors and a replay of the user journey.
2. Measure puzzle-level engagement: attempts, solves, failures, hint usage, chapter funnel.
3. Get a custom APM span per `/run` with tags rich enough to debug latency and security rejections without re-reading logs.
4. Click from a RUM session into the matching backend trace.

## Architecture

```
Browser (RUM SDK, dynamically imported from CDN)
  ├─ auto: views, errors, resources, long tasks, replay (20% sampled)
  ├─ custom actions:
  │     puzzle.attempt | puzzle.solved | puzzle.failed
  │     hint.used
  │     chapter.started | chapter.completed
  └─ allowedTracingUrls: [window.location.origin]
                       │  (injects x-datadog-trace-id / x-datadog-parent-id on /run and /event)
                       ▼
Node server (dd-trace already initialized in server/tracer.js)
  ├─ GET  /config  → { applicationId, clientToken, site, service, env, version }
  │                    or { enabled: false } when env vars are absent
  ├─ POST /run     → wrapped in tracer.trace('chrono.query', …) with rich tags
  └─ POST /event   → validates against allow-list, emits dogstatsd metric, 204 No Content
                       │
                       ▼
datadog/serverless-init sidecar → Datadog (Traces, Metrics, Logs, RUM)
```

## Components

### PR 1 — server: custom span + game metrics + `/event`

**`server.js`**

- Wrap `handleRun` body in `tracer.trace('chrono.query', span => { … })`. Tags set across phases:
  - `chapter` — request param
  - `sql.length` — characters in submitted SQL
  - `validation.ok` — boolean
  - `validation.reason` — set only if not ok
  - `result.rows` — `result.rows?.length ?? 0`
  - `result.truncated` — boolean
  - On caught error: `span.setTag('error', err)` so APM marks the span red.
- New `handleEvent(req, res)`:
  - Same body-size limit (`MAX_BODY`) and `readJsonBody` as `/run`.
  - Same rate limiter (`allowRequest`); shares the per-IP budget with `/run`.
  - Validates `type` against an allow-list; validates `chapter` with the existing regex; validates `puzzle` as `/^[a-z0-9-]+$/`; clamps `attempts` to `[1, 999]`; `reason` from a fixed enum.
  - On success: emits the corresponding metric, returns 204 No Content.
  - On reject: 400 (validation) or 429 (rate limit), structured log at `warn`.

**`server/metrics.js`** — no API change. New metric names flow through `increment` / `timing` unchanged.

**Metric catalogue**

| Metric | Type | Tags |
|---|---|---|
| `chrono.puzzle.attempt` | counter | `chapter`, `puzzle` |
| `chrono.puzzle.solved` | counter | `chapter`, `puzzle` |
| `chrono.puzzle.attempts_to_solve` | distribution | `chapter`, `puzzle` |
| `chrono.puzzle.failed` | counter | `chapter`, `puzzle`, `reason` |
| `chrono.hint.used` | counter | `chapter`, `puzzle` |
| `chrono.chapter.started` | counter | `chapter` |
| `chrono.chapter.completed` | counter | `chapter` |
| `chrono.event.rejected` | counter | `reason` (e.g. `rate_limit`, `unknown_type`, `invalid_field`) |

### PR 2 — RUM bootstrap

**`server.js`** — new `GET /config`:
- Reads env vars `DD_RUM_APPLICATION_ID`, `DD_RUM_CLIENT_TOKEN`, `DD_SITE`, `DD_SERVICE`, `DD_ENV`, `DD_VERSION`.
- If `DD_RUM_APPLICATION_ID` is missing, returns `{ enabled: false }`.
- Otherwise returns the full config object. No secrets that aren't already client-facing — RUM `clientToken` is intended for browser use.
- GET only; other methods → 405.

**`src/rum.js`** — new module:
- `fetch('/config')`. If `enabled: false`, exit silently.
- Dynamic import of `@datadog/browser-rum` from the Datadog CDN.
- `init({ applicationId, clientToken, site, service, env, version, sessionSampleRate: 100, sessionReplaySampleRate: 20, defaultPrivacyLevel: 'mask-user-input', allowedTracingUrls: [window.location.origin], trackUserInteractions: true, trackResources: true, trackLongTasks: true })`.
- `startSessionReplayRecording()`.
- Exports `rumAction(name, attrs)` and `rumError(err, attrs)`. Both are no-ops if init didn't run.

**`index.html` / `src/main.js`** — import `src/rum.js` once at boot. Import is async; game UI does not wait on it.

**CSP update in `server.js`** — extend the existing policy:
- `script-src`: add `https://www.datadoghq-browser-agent.com`
- `connect-src`: add `https://browser-intake-*.datadoghq.com` (or the exact host for `DD_SITE`)
- `worker-src 'self' blob:` — required by session replay's worker

### PR 3 — frontend custom actions + `/event` calls

**`src/telemetry.js`** — new wrapper:
- `emit(type, payload)` — calls `rumAction(type, payload)` and `fetch('/event', { method: 'POST', body: JSON.stringify({ type, ...payload }) })` in parallel.
- Catches and swallows fetch errors so the game never breaks on telemetry.

**Wire-up sites** (exact files identified during implementation):
- Puzzle submit handler: `puzzle.attempt`; on correct, `puzzle.solved` with `attempts`; on incorrect, `puzzle.failed` with `reason`.
- Hint reveal: `hint.used`.
- Chapter transitions in `src/state.js` / `src/main.js`: `chapter.started` and `chapter.completed`.

## Data flow

### `/event` request shape

```json
POST /event
{
  "type": "puzzle.solved",
  "chapter": "ch3-census",
  "puzzle": "p4",
  "attempts": 3
}
```

Allow-list (all fields beyond these are ignored):

| `type` | required fields | metric(s) emitted |
|---|---|---|
| `puzzle.attempt` | `chapter`, `puzzle` | `chrono.puzzle.attempt` |
| `puzzle.solved` | `chapter`, `puzzle`, `attempts` | `chrono.puzzle.solved` + `chrono.puzzle.attempts_to_solve` |
| `puzzle.failed` | `chapter`, `puzzle`, `reason` | `chrono.puzzle.failed` |
| `hint.used` | `chapter`, `puzzle` | `chrono.hint.used` |
| `chapter.started` | `chapter` | `chrono.chapter.started` |
| `chapter.completed` | `chapter` | `chrono.chapter.completed` |

`reason` enum: `wrong_result | sql_error | security_rejected | timeout`.

### RUM ↔ APM correlation

`allowedTracingUrls: [window.location.origin]` causes the RUM SDK to inject `x-datadog-trace-id` and `x-datadog-parent-id` on `/run` and `/event`. `dd-trace`'s HTTP auto-instrumentation picks them up; the custom `chrono.query` span becomes a child of the RUM session's frontend span. Click-through from a RUM session view into the backend trace works without extra config.

### Client boot sequence

1. `index.html` loads `main.js`.
2. `main.js` imports `src/rum.js` (async; non-blocking).
3. `rum.js` fetches `/config`. If `enabled: false`, exits.
4. Otherwise dynamic-imports the RUM SDK from CDN, calls `init`, starts session replay recording.
5. Game UI calls `src/telemetry.js`, which dispatches to `rumAction()` and `POST /event` in parallel.

## Error handling

**`/event` endpoint**
- Body too large / invalid JSON / empty body → 400 with the same error shape as `/run`, logged at `warn`.
- Unknown `type` or invalid field → 400, log `event.rejected` with `{type, reason}`, no metric for the event itself; counter `chrono.event.rejected{reason}` instead.
- Rate-limited (shared `allowRequest`) → 429, log `event.rate_limited`. Counter `chrono.event.rejected{reason:rate_limit}`.
- Success → 204 No Content.

**`/config` endpoint**
- Missing env vars → 200 with `{ enabled: false }`. Keeps local dev quiet and lets unconfigured deploys boot cleanly.
- GET only; other methods → 405.

**Client RUM init**
- `fetch('/config')` fails → swallow, RUM stays uninitialized, `rumAction` / `rumError` become no-ops. Game must keep working without telemetry.
- Dynamic SDK import fails (CDN blocked, CSP mismatch) → catch and `console.warn` once; no rethrow. Same no-op fallback.
- `defaultPrivacyLevel: 'mask-user-input'` masks user-typed SQL in replay by default.

**Custom span on `/run`**
- Existing `try/catch` stays. In the catch, also call `span.setTag('error', err)`. No behavior change to the HTTP response shape.

**`/event` emission failures**
- `metrics.increment` is already a no-op when dd-trace isn't initialized.
- A throw inside the handler still returns a JSON error and logs at `error`. A metric failure never breaks a request.

**Trust boundary**
- Client supplies `chapter`, `puzzle`, `attempts`. We validate format and clamp ranges but do not authenticate that "solved" means actually solved. The metric measures *reported* outcomes, which is the right signal for funnels. Anti-cheat is explicitly out of scope.

## Testing

### Unit tests (Node test runner, `tests/`)

- **`tests/event.test.js`** — new
  - Allow-list: each valid `type` accepted; unknown `type` → 400.
  - Field validation: missing `puzzle`, malformed `chapter`, `attempts` out of range → 400.
  - Rate limit shared with `/run`: exceed threshold via `/event` calls → 429.
  - Body limit: oversized payload → 400.
- **`tests/config.test.js`** — new
  - Env vars set → expected shape.
  - Env vars missing → `{ enabled: false }`, status 200.
  - Non-GET methods → 405.
- **`tests/metrics.test.js`** — extend or new
  - Stub `tracer.dogstatsd`; assert `increment` / `distribution` called with the expected name + tag list for each event type.
- **`tests/run-span.test.js`** — new
  - Stub `tracer.trace` to capture the active span; happy path → assert tags `chapter`, `result.rows`, `validation.ok=true`. Security-rejected path → assert `validation.ok=false` and `validation.reason` present.

### E2E (Playwright, `tests/e2e/`)

- Extend the smoke test: stub `/config` to return `{ enabled: false }` so RUM init exits cleanly in CI. Assert the game still boots and a puzzle still solves. The regression we're guarding against is "telemetry code breaks the app when disabled."
- Optional, skipped in CI: with RUM init enabled against a fake config, solve a puzzle and intercept the `POST /event` request; assert the body shape.

### Manual verification (post-deploy)

- After PR 1: in APM, find a `chrono.query` span; confirm tags. In Metrics Explorer, confirm `chrono.puzzle.solved{*}` after a manual solve.
- After PR 2: open the live site; confirm a RUM session appears in the RUM Explorer.
- After PR 3: solve a puzzle on the live site; in the RUM session, see the `puzzle.solved` action; click through to the matching backend trace.

## Rollout sequence

| PR | Changes | Risk | Verified by |
|---|---|---|---|
| PR 1 | `chrono.query` span, `/event` endpoint, new metrics, unit tests | Low — server-only, no client changes | Unit tests + APM/Metrics Explorer post-deploy |
| PR 2 | `/config` endpoint, `src/rum.js`, CSP update | Medium — touches CSP and adds CDN dependency | Smoke test with `/config` stubbed; RUM session visible post-deploy |
| PR 3 | `src/telemetry.js` + wire-up in puzzle / hint / chapter sites | Low — additive call sites with swallowed failures | Optional Playwright; manual solve post-deploy |

Each PR is independently deployable. PR 1 alone gives backend value without any frontend exposure. PR 2 ships RUM with no custom actions yet — still useful for views/errors/replay. PR 3 adds the funnels.

## Configuration

New Cloud Run env vars (set at deploy time, not in repo):
- `DD_RUM_APPLICATION_ID`
- `DD_RUM_CLIENT_TOKEN`
- `DD_SITE` (e.g. `datadoghq.com`)
- `DD_VERSION` (already in dd-trace init; reuse)

Existing vars in use: `DD_SERVICE`, `DD_ENV`, `DD_TRACE_ENABLED`.
