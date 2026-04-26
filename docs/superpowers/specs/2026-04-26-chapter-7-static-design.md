---
title: Chapter 7 — "Static" — Design
date: 2026-04-26
status: draft
phase: Phase 2, Chapter 7 of 11
---

# Chapter 7 — "Static" — Design

## Summary

First chapter of Phase 2. Concept: **tag-based selection** in DDSQL — `key:value` shorthand, implicit AND across multiple tags, negation prefix. Mechanic: typing (continued from Phase 1). Setting: Chrono Consulting HQ, picking up days after the Phase 1 finale; logs are partly restored, the CEO ("M.") is still flying in, and the player's first investigation surfaces a service named `chrono-portal-mirror` that isn't on the official catalog. The first sighting of the Phase 2 phantom.

This is the chapter that introduces the **DDSQL→DuckDB translator** as a server-side pipeline component. Future chapters extend it.

## Goals

- Teach DDSQL tag syntax: `key:value`, implicit AND, negation `-key:value`.
- Introduce the translator architecture sketched in the season spec — `tagFilter` stage, server-side, between player input and the security validator.
- Land the Phase 2 mood shift: same firm, new floor, the building's monitoring is clearly broken, the CEO is a felt presence via a redacted email.
- Surface the phantom service `chrono-portal-mirror` for the first time. The data does the work — the player notices the name in Puzzle 05's result set before Carol points it out.

## Non-goals

- Other DDSQL features — wildcards (`key:val*`), explicit OR, nested logic. Saved for Phase 1.5 or punted.
- Other telemetry types — spans, metrics, RUM. Future chapters.
- The CEO on-page in person. She's still flying back. Indirect signals only.
- Solving the phantom. Chapter 7 surfaces it; Chapters 8–11 build the case; Chapter 11 lands it.

## Mechanic — typing (no new mode)

`mechanic_mode: "typing"` from Chapter 5/6 carries over. The typed-blank renderer, SQL assembler, hint system, and row comparator handle DDSQL queries without modification — the translator transforms the player's typed text into DuckDB before it hits the engine.

## Translator — `tagFilter` stage

The first translator stage, introduced in this chapter. Lives at `server/ddsql.js`, exported as a pure function `translateTagFilter(sql: string): string`.

### What it translates

Input fragments inside a `WHERE` clause:

| DDSQL input | DuckDB output |
|---|---|
| `service:auth-svc` | `tags['service'] = 'auth-svc'` |
| `service:auth-svc env:prod` | `tags['service'] = 'auth-svc' AND tags['env'] = 'prod'` |
| `-level:info` | `tags['level'] != 'info'` (or `NOT tags['level'] = 'info'`) |
| `service:auth-svc -level:info` | `tags['service'] = 'auth-svc' AND tags['level'] != 'info'` |

### Behaviour rules

- The stage looks for tokens of shape `[-]?key:value` inside the `WHERE` clause and rewrites them. Tokens elsewhere (SELECT list, FROM, ORDER BY, LIMIT) pass through.
- Quoted values: `service:'my service'` translates to `tags['service'] = 'my service'`. Quotes preserved.
- Multi-tag implicit AND: spaces between `key:value` tokens become `AND`.
- Negation: leading `-` becomes `!=`. The translated condition uses `!=` (rather than `NOT (... = ...)`) for cleanliness.
- Pass-through: input that already looks like DuckDB (`tags['service'] = 'x'`) is left alone — the regex matches `key:value` only.

### Pipeline

```
player input → translateTagFilter() → security validator → DuckDB
```

Translator is the new step. The security validator runs *after* translation, on the DuckDB output. The validator's allow-list (`SELECT`/`WITH` only) and function blocklist (filesystem reads) work unchanged on the translated SQL.

### Test contract

`tests/ddsql-tag-filter.test.js`:
- Single tag: input/output pair
- Multi-tag implicit AND
- Negation
- Mixed: positive + negation
- Pass-through (no DDSQL syntax) returns input unchanged
- Pass-through (already-translated DuckDB form) returns input unchanged
- Edge: tag value with spaces (quoted)
- Edge: tag value containing colon (e.g., a URL — not currently supported; document the limitation)

## Data — `logs` parquet, ~2000 rows

### Schema

```sql
CREATE TABLE logs (
  timestamp  TIMESTAMP,
  message    VARCHAR,
  tags       MAP(VARCHAR, VARCHAR)
);
```

`timestamp` and `message` are first-class columns (matches DDSQL's `@timestamp` / `@message` reserved attributes). Everything else lives in `tags`.

### Tag keys present

Every log row has these tag keys populated (varying values):
- `service` — one of ~12 service names + `chrono-portal-mirror` (the phantom)
- `env` — `prod`, `staging`, `dev`
- `host` — pseudo-realistic hostnames (`prn-host-001` through `prn-host-040`)
- `level` — `info`, `warn`, `error`
- `status` — HTTP status code (when applicable; `200`, `404`, `500`, etc.)
- `region` — `us-central1`, `us-east1`, etc.

### Volume

- ~2000 logs total, spanning roughly the last 1 hour of activity (timestamps cluster between `now() - INTERVAL '1 hour'` and `now()`).
- ~12 legitimate services, distributed roughly evenly.
- **6 logs from `chrono-portal-mirror`** scattered in time. Their `message` values are sparse and cryptic (e.g., `"portal handshake initiated"`, `"transit window aligned"`, `"key exchange ok"` — vague, technical, not obviously sinister but conspicuously not normal application logs).
- ~50 errors across all services (varied causes). One of those error logs is from `chrono-portal-mirror` (so Puzzle 05's `level:error` filter surfaces the phantom in its results).

### Generator

`scripts/generate-logs.js` produces `content/chapters/07-static/data/logs.parquet`. Deterministic — re-runs produce byte-identical output. Same pattern as Phase 1's `generate-tavern-seed.js` and `generate-census-csv.js`.

DuckDB has native parquet write support via `COPY (SELECT ...) TO '...' (FORMAT PARQUET)`. The generator builds rows in memory, COPYs them out via DuckDB.

### Sanity checks (in the generator script)

- Row count is exactly 2000.
- `chrono-portal-mirror` count is exactly 6.
- At least one of those 6 has `level:error` (so Puzzle 05's filter sees the phantom in the result set).
- All logs span timestamps within the last hour.

If any check fails, the generator throws — re-runs only emit the parquet if invariants hold.

### `seed.sql`

```sql
CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/07-static/data/logs.parquet');
```

Same `${CONTENT_ROOT}` substitution pattern Chapter 4 uses. Once seeded, `read_parquet` is no longer reachable from player queries (the existing security validator's blocklist handles that).

## Puzzle arc

| # | Concept | Player query | Reveals |
|---|---|---|---|
| 01 | Schema intro | `SELECT timestamp, message, tags FROM logs LIMIT 10` | Player meets the logs schema. No DDSQL syntax yet. |
| 02 | Single tag filter | `SELECT * FROM logs WHERE service:auth-svc` | First DDSQL `key:value` shorthand. ~150 rows. |
| 03 | Implicit AND | `SELECT * FROM logs WHERE service:auth-svc env:prod` | Multiple tags, space-separated, AND'd. ~110 rows. |
| 04 | Negation | `SELECT * FROM logs WHERE service:auth-svc env:prod -level:info` | Negation prefix excludes noise. ~30 rows. |
| 05 | Practice — different tag type | `SELECT * FROM logs WHERE level:error` | All errors across all services (~50 rows). The phantom's error log is in there; Carol's success copy notices the unfamiliar name. |
| 06 | **Phantom finale** | `SELECT * FROM logs WHERE service:chrono-portal-mirror` | 6 rows. Cryptic messages. Carol's reaction lands the chapter. |

Each puzzle's expected result row count is locked in by the generator's distribution. The generator's sanity-check block enforces the targets.

## Narrative — first draft

Tone: Carol's voice from Phase 1 carries — dry, tired, weirdly protective. The CEO is the new tonal element, present only through indirect signals. The phantom service is the chapter's slow-build dread.

### Cold open (Carol)

> Carol drops a printout on your desk. Most of the page is redacted black. You can read the subject line — *RE: forensic plan, post-Hemiunu* — and one line of body: *— if she's still in the country, get her on a video call by Wednesday. Otherwise pull her access. — M.*
>
> "She's the CEO. The 'M' is initial, not name. Don't ask. She's three hours out and sending notes that arrive an hour before she does, which is a problem with our infrastructure as much as with her."
>
> Carol sits down. "Logs are coming back online. About sixty percent. Whoever cut the observability didn't quite finish the job. Some of the gaps are interesting."
>
> She gestures at the screen. "We have a query language for log search — DDSQL. SQL-shaped, but tags use a colon. `service:auth-svc` is the same as `service equals auth-svc`. We're going to use it because that's what the data speaks. Same typing as last chapter. The forms haven't gotten fancier."

### Per-puzzle dialogue

**Puzzle 01 — "Ten lines"**
- *brief*: Carol: "Show me ten lines. I want us both staring at the same thing before I ask anything else."
- *success*: Carol: "Right. Time, message, tags. Tags is where we live this season. Get used to it."

**Puzzle 02 — "Auth, and only auth"**
- *brief*: Carol: "Pull every log from auth-svc. In DDSQL — `service:auth-svc`. That's the new shape."
- *success*: Carol: "About a hundred fifty. That's normal volume for an hour. Auth is the bottom of the stack — nothing builds on top of nothing."

**Puzzle 03 — "Prod only"**
- *brief*: Carol: "Now narrow it to prod. Two tags, separated by a space. Implicit AND. DDSQL won't make you type the word."
- *success*: Carol: "Down to a hundred and ten. Staging and dev account for the rest. Carry on."

**Puzzle 04 — "Drop the chatter"**
- *brief*: Carol: "Same query. Drop info-level. Negation in DDSQL is a leading hyphen on the tag — `-level:info`. Same way you'd remove a term from a search."
- *success*: Carol: "Thirty rows. Now we can actually read them."

**Puzzle 05 — "All of the errors"**
- *brief*: Carol: "Forget auth for a second. Show me everything that errored in the last hour. `level:error`, anywhere it lives. Take a moment to read the service column."
- *success*: Carol scans the result. Her finger stops on the last row. "Forty-eight errors. Forty-seven of them I can place." She taps the screen. "This one — `chrono-portal-mirror`. We don't have a service called that. Pull just its logs. All of them."

**Puzzle 06 — "What's not on the catalog"**
- *brief*: Carol: "`service:chrono-portal-mirror`. Whatever it is, it's logging. Show me everything."
- *success*: Carol reads down the list. Six rows. "*Portal handshake initiated.*" "*Transit window aligned.*" "*Key exchange ok.*" Nothing about a customer, or a request, or a user.
  >
  > She doesn't say anything for a beat. Then: "We don't deploy services with names like that. Whoever does, doesn't work for us. Or shouldn't."

### Outro / Chapter 8 stinger

> Carol prints the six log lines and pins them to the corkboard above her desk. The corkboard already has Phase 1 artifacts on it — the patron register page from Oldrich's tavern, the four ledger lines from the Reunion. She moves those over to make room.
>
> Her phone buzzes. Voicemail. She lets it play on speaker.
>
> A woman's voice — older, clipped, mid-Atlantic the way 1950s movie stars used to sound. *"Carol. I see what you sent. I'll be on the ground at six. Don't touch the timestamps. We're going to want to know exactly when each of those fired. Not the order — the seconds. Find me the seconds."*
>
> Click. No goodbye. No name.
>
> Carol turns off her speaker. "Right. The seconds. That's tomorrow."

## Engine changes

**Two new pieces; one one-line change.**

### New: `server/ddsql.js`

Module exports the `translateTagFilter(sql)` function. Pure, no side effects, no I/O. Easy to unit-test.

```js
// server/ddsql.js
export function translateTagFilter(sql) {
  // ... regex-based replacement of [-]?key:value tokens inside WHERE clauses
}
```

### New: `tests/ddsql-tag-filter.test.js`

Standard `node --test` style, mirrors `tests/sql-assembly.test.js`. Test cases enumerated above under "Test contract".

### One-line change: `server.js` — pipe through translator

The existing `handleRun` function (around line 99 in `server.js`) currently calls `validateSql(sql)` directly on the player's input. After this chapter ships:

```js
const translated = translateTagFilter(sql);
const validation = validateSql(translated);
// ... rest unchanged
```

The translator runs first, the validator runs on translated output, the executor runs the validated DuckDB. Three-stage pipeline.

If the translator throws (malformed DDSQL — unlikely with this stage's simple regex), the error propagates as a `query.body_error` log + 400 response. The hint system surfaces it via the existing `when: error` path.

## Wiring (one-line additions)

1. **`src/main.js`** — append `'07-static'` to `CHAPTER_ORDER`.
2. **`src/reference.js`** — add `'07-static'` entry to `CONCEPTS_FOR_CHAPTER`. Concepts list inherits everything Phase 1 ended with, plus the new `ddsql-tags`.
3. **No new speaker** — Carol carries; the CEO is voicemail/email only, no chat-bubble assignment yet.

## Reference markdown — one new file

`content/reference/ddsql-tags.md`:

```markdown
# DDSQL tags

DDSQL is SQL-shaped, but it filters on tags using a colon shorthand. Where regular SQL says `WHERE service = 'auth-svc'`, DDSQL says `WHERE service:auth-svc` — same meaning, half the typing, no quotes around values that don't contain spaces.

## Forms

```ddsql
WHERE service:auth-svc                    -- single tag
WHERE service:auth-svc env:prod           -- multiple tags, implicit AND
WHERE service:auth-svc -level:info        -- leading hyphen excludes
```

## Notes

- The tag key is whatever's left of the colon; the value is whatever's right. No quotes needed for simple values.
- Spaces between tag conditions mean AND. There's no DDSQL way to say "OR" in this chapter (a later chapter introduces it, if at all — many DDSQL queries simply don't need it).
- The hyphen is the negation operator. `-level:info` excludes rows where level = info. It does *not* mean "key called -level".
- Quoted values work for spaces: `service:'my service with spaces'`.
- Tags you haven't seen before still work — DDSQL doesn't validate that the key exists. If no rows match, you get an empty result, not an error.
```

## Testing

| What | How |
|---|---|
| Translator unit tests | `tests/ddsql-tag-filter.test.js` — input/output pairs (see Test contract above) |
| Content validator | Existing `npm run validate-content` — runs each puzzle's expected DDSQL through the translator + DuckDB |
| Generator invariants | `scripts/generate-logs.js` throws if row count, phantom count, or error-distribution targets aren't met |
| Engine unit tests | None new — `assembleSql`, `compareRows`, `selectHint` all unchanged |
| Playwright smoke | Extend `tests/e2e-smoke.spec.js` with Chapter 7 Puzzle 01 walkthrough (mirrors Ch 5/6 pattern) |
| Manual playtest | Append Chapter 7 section to `docs/playtest-checklist.md` covering boot/nav, the three sub-concepts, the phantom finale, and the CEO voicemail in the outro |

## Open questions / things to confirm in the implementation plan

- **`message` content for non-phantom logs.** Need ~2000 messages that read as plausible application logs ("GET /v1/billing/charge 200 23ms", "user 4f12a3 authenticated", etc.). The plan should pick a small set of templates and parameterize.
- **Tag value distribution.** Whether each non-phantom service has roughly equal log volume, or one or two services dominate (more realistic). Default: roughly equal for puzzle predictability; a stretch chapter could vary.
- **Wildcard behavior in the translator** — out of scope for this chapter, but the translator's regex needs to gracefully not-match wildcard syntax in case a player tries it. Document that `service:auth-*` produces a no-result instead of an error (since `auth-*` becomes a literal value the MAP lookup never matches).
- **CEO voicemail timing in the UI.** Whether the voicemail audio actually plays in the browser, or it's just text. Default: text-only with formatting that suggests speech. Audio is a stretch goal.
