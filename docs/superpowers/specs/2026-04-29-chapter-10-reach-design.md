---
title: Chapter 10 "Reach" — Design Spec
date: 2026-04-29
status: approved
phase: Phase 2 (Chapters 7–11)
---

# Chapter 10 "Reach" — Design Spec

## Summary

Chapter 10 introduces Polymorphic Table Functions (PTFs): `logs()` and `spans()`. The player uses PTF syntax to find `chrono-portal-mirror` in two telemetry sources, then queries the plain `services` catalog and gets 0 rows back. The double stinger: the founding documents have a redacted second name, and the phantom was querying the firm's own internal document stores. Sets up Ch11's tag-join finale.

## Concept area

**Polymorphic Table Functions (PTFs)** — `logs(service:auth-svc)`, `spans(service:chrono-portal-mirror)`. Tag-filter args inside the PTF parens. New translator stage `translatePTF` converts to plain DuckDB `FROM <table> WHERE <conditions>`.

PTFs in scope: `logs()` and `spans()`. `metrics()` and `rum()` deferred to Ch11 data if needed.

## Mechanic

Typing (same as Ch7–9). No new mechanic mode.

## Architecture

### New translator stage: `translatePTF()`

Detects `FROM logs(...)` or `FROM spans(...)`, extracts tag-filter args from inside the parens, and rewrites to `FROM <table> WHERE <duckdb-conditions>`. Reuses tag filter logic internally so `translateTagFilter` downstream sees clean DuckDB and passes through untouched.

**Input → output:**
```
FROM logs(service:chrono-portal-mirror level:error)
  →
FROM logs WHERE tags['service'] = 'chrono-portal-mirror' AND tags['level'] = 'error'
```

No-arg PTF (`FROM logs()`) → `FROM logs` (no WHERE added).

Unknown PTF name → throw typed player-facing error (not a DuckDB error).

**WHERE merging edge case:** If the query has both PTF args AND a separate `WHERE` clause (e.g. `FROM logs(service:auth-svc) WHERE @timestamp:[now-1h to now]`), the translator must merge the PTF-derived conditions into the existing WHERE with AND — not emit two `WHERE` keywords. No Ch10 puzzle exercises this combination, but the translator must handle it correctly since `translateTimeWindow` downstream may produce a WHERE clause of its own.

**Pipeline after Ch10:**
```
translateBucket(
  translateTagFilter(
    translateTimeWindow(
      translateRate(
        translatePTF(sql)
      )
    )
  )
)
```

`translatePTF` runs innermost — must fire before `translateTagFilter` sees the WHERE clause.

### Files touched

| File | Change |
|---|---|
| `server/ddsql.js` | Append `translatePTF()` function |
| `server.js` | Add `translatePTF` to import + pipeline |
| `src/main.js` | Append `'10-reach'` to `CHAPTER_ORDER` |
| `src/reference.js` | Add Ch10 concept list (9 slugs) |
| `content/chapters/10-reach/` | New chapter directory (all content files) |
| `content/reference/ptfs.md` | New reference doc |
| `tests/ddsql-ptf.test.js` | New translator unit tests |
| `tests/e2e-smoke.spec.js` | Append Ch10 smoke test |
| `docs/playtest-checklist.md` | Append Ch10 section; fix Ch9 outro note |

`server/security.js`, `server/duckdb.js`, `src/puzzle.js` — no changes.

## Data shape

Three tables loaded at chapter init via `seed.sql` from `content/chapters/10-reach/`:

### `logs` (~500 rows)
- Columns: `timestamp TIMESTAMP`, `message VARCHAR`, `tags MAP(VARCHAR, VARCHAR)`
- Tags: `service`, `level`, `env`
- Services: auth-svc, api-gateway, chrono-archive, chrono-ledger, metrics-collector, chrono-portal-mirror
- `chrono-portal-mirror`: ~80 rows, error-heavy, clustered in the 6 spike windows from Ch9 (every 18 minutes)
- Loaded from `data/logs.parquet`

### `spans` (~300 rows)
- Columns: `trace_id VARCHAR`, `timestamp TIMESTAMP`, `tags MAP(VARCHAR, VARCHAR)`, `operation VARCHAR`, `duration_ms INTEGER`, `called_service VARCHAR`
- Normal services call each other (auth-svc → api-gateway, etc.)
- `chrono-portal-mirror`: ~50 spans; `called_service` values are `chrono-archive` and `chrono-ledger`
- This is the P5 reveal: the phantom was querying the firm's internal document stores
- Loaded from `data/spans.parquet`

### `services` (~12 rows, inline SQL in seed.sql)
- Columns: `service_name VARCHAR`, `team VARCHAR`, `tier INTEGER`, `registered_at DATE`
- Includes: auth-svc, api-gateway, chrono-archive, chrono-ledger, metrics-collector, and others
- Does NOT include: `chrono-portal-mirror`
- P6 query returns 0 rows

### Generator script
`scripts/generate-ch10-data.js` — deterministic, same pattern as Ch9 generator. Produces `data/logs.parquet` and `data/spans.parquet`. Services table is inline INSERT in `seed.sql`.

## Puzzle arc

### Puzzle 01 — PTF intro (warm-up with auth-svc)

**Brief:** "System's back online. Pull me ten rows from auth-svc — I want to see if logs are flowing."

**Query:**
```sql
SELECT timestamp, message FROM logs(___) LIMIT 10
```
**Blank:** `service:auth-svc`

**Expected result:** 10 rows, timestamp + message from auth-svc logs.

**Success:** "Good. Logs are back online. Now let's see what else is in here."

**Wrong paths:**
- Wrong service name → 0 rows → wrong_count_low hint
- Missing `service:` prefix (just `auth-svc`) → translator error hint (invalid tag syntax)

---

### Puzzle 02 — Find the phantom in logs

**Brief:** "Same query. Different service."

**Query:**
```sql
SELECT timestamp, message FROM logs(___) LIMIT 20
```
**Blank:** `service:chrono-portal-mirror`

**Expected result:** ~20 phantom log rows.

**Success:** "It's in the logs. Twenty rows. That's not a ghost — that's a service that ran."

**Wrong paths:**
- auth-svc or other valid service → wrong rows → different_values hint
- Wrong service name → 0 rows → wrong_count_low hint

---

### Puzzle 03 — Error characterization

**Brief:** "How many of those are errors? Filter it down."

**Query:**
```sql
SELECT timestamp, message FROM logs(service:chrono-portal-mirror ___) ORDER BY timestamp DESC LIMIT 10
```
**Blank:** `level:error`

**Expected result:** ~10 error-level logs in reverse chronological order.

**Success:** "All errors. Every log from this service is an error. Something kept trying and kept failing."

**Wrong paths:**
- `level:info` → 0 rows → wrong_count_low hint
- `level:warning` → 0 rows → wrong_count_low hint

---

### Puzzle 04 — Introduce spans

**Brief:** "Logs tell you what happened. Spans tell you what a service *called*. Different table, same syntax."

**Query:**
```sql
SELECT trace_id, operation, duration_ms, called_service FROM ___(service:chrono-portal-mirror) LIMIT 10
```
**Blank:** `spans`

**Expected result:** 10 span rows showing trace_id, operation, duration_ms, called_service.

**Success:** "Different shape. You can see the duration and what it was talking to."

**Wrong paths:**
- `logs` → rows returned but no `called_service` column → error hint about column not found
- `metrics` → unknown PTF error → hint

---

### Puzzle 05 — Aggregate called_service

**Brief:** "What was it calling? Group those spans."

**Query:**
```sql
SELECT called_service, COUNT(*) as call_count
FROM spans(service:chrono-portal-mirror)
GROUP BY ___
ORDER BY call_count DESC
```
**Blank:** `called_service`

**Expected result:** 2 rows — `chrono-archive` (N calls), `chrono-ledger` (N calls).

**Success:** "`chrono-archive` and `chrono-ledger`. It was querying the firm's own document stores. Not external. Internal. It was looking for something in here."

**Wrong paths:**
- `service` (from tags) → single row, wrong shape → different_values hint
- `operation` → multiple rows, wrong grouping → different_values hint

---

### Puzzle 06 — Catalog check

**Brief:** "One last check. Is it in the catalog?"

**Query:**
```sql
SELECT * FROM services WHERE service_name = '___'
```
**Blank:** `chrono-portal-mirror`

**Expected result:** 0 rows (that's the correct answer — 0 rows means success).

**Success:** "Zero rows. It's in logs, in spans — and nowhere in the catalog. Carol opens the founding documents in chrono-archive. Two columns of names. The second column is redacted."

**Wrong paths:**
- A real service name (e.g. `auth-svc`) → rows returned → wrong_count_high hint

**Note on puzzle correctness:** P6 accepts any 0-row result as success — the educational point is that the service is absent from the catalog. Any misspelled or made-up name also returns 0 rows, which is fine (player still confirmed absence). The puzzle.json `expected` block should specify `row_count: 0`.

## Narrative beats

### Boss intro

Carol is at her desk. A security badge with no photo sits face-down on the corner of it — she doesn't comment on it. She briefs the player while clearly distracted:

> "M. wants to know where else it shows up. Logs I can search. But logs only tell you what a service said. I want to know what it *talked to*. Let's start with what we have."

The badge is a visual detail in Carol's narration, not a dialogue beat.

### Chapter outro

> Carol puts down the founding documents. The second name was redacted in every copy she found — digitized archives, printed copies, the onboarding packet from when the firm hired her three years ago.
>
> Consistent redaction is editorial. Someone decided this person doesn't exist.
>
> She tapes the badge to the whiteboard next to the six spike windows. Then she sits down and pulls up the spans again. `chrono-archive`. `chrono-ledger`. The firm's oldest document stores — the ones that predate the catalog, the ones no one migrated because no one was sure what was in them.
>
> M.'s question was never *where* the service was. It was *what it was looking for*.

### Auto-advance

Chapter 10 does NOT auto-advance (Ch11 not yet shipped). Same pattern as Ch9 before Ch10 shipped.

## Reference drawer

**Ch10 concepts (9 slugs):** select, from, where, group-by, order-by, ddsql-tags, time-windows, rate, ptfs

**New reference doc:** `content/reference/ptfs.md`
- What PTFs are (polymorphic table functions — call a function to get a table)
- Syntax: `FROM logs(service:auth-svc)` — tag-filter args in parens
- Available sources: `logs()`, `spans()`
- Column schemas for each source
- No-arg form for schema peek

## Testing

### Translator unit tests (`tests/ddsql-ptf.test.js`, ~12 tests)

1. `FROM logs(service:auth-svc)` → `FROM logs WHERE tags['service'] = 'auth-svc'`
2. `FROM spans(service:chrono-portal-mirror)` → `FROM spans WHERE tags['service'] = 'chrono-portal-mirror'`
3. Multi-tag: `FROM logs(service:auth-svc level:error)` → AND-joined conditions
4. No-arg: `FROM logs()` → `FROM logs`
5. Case-insensitive: `FROM LOGS(service:auth-svc)` → same output
6. Unknown PTF: `FROM traces(service:x)` → throws typed player-facing error
7. Pass-through: non-PTF input exits unchanged
8. Composition: PTF output fed through `translateTagFilter` — no double-transform of already-translated tags
9. PTF inside full query: `SELECT * FROM logs(service:auth-svc) LIMIT 10` → full translated query
10. `spans()` with multi-tag args
11. PTF with existing WHERE clause (edge case — args + external WHERE)
12. Whitespace tolerance: `FROM logs( service:auth-svc )` → correct output

### E2E smoke test (appended to `tests/e2e-smoke.spec.js`)

- Plant Ch10 state in localStorage (Ch1–9 completed)
- Check 2 bubbles: boss intro + brief
- Check brief contains expected text (references auth-svc or logs)
- Fill typed input: `service:auth-svc`
- Run → expect success bubble

### Playtest checklist additions

New Ch10 section covering:
- All 6 puzzles: correct path + at least one wrong path each
- P4 wrong path: typing `logs` instead of `spans` → error hint
- P5 wrong path: `service` instead of `called_service` → different_values hint
- P6 wrong path: misspelled service name → wrong_count_low hint
- Reference drawer: 9 concepts visible, PTFs entry renders without error
- Ch9 outro note updated: "auto-advances to Chapter 10"

### Content validator

Existing `npm run validate-content` should exercise each puzzle's canonical query through the full translator + DuckDB pipeline.
