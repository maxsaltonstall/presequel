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

**Brief:** *(Embedded in boss intro — see Narrative beats below. Final line: "Give me ten rows from auth-svc.")*

**Query:**
```sql
SELECT timestamp, message FROM logs(___) LIMIT 10
```
**Blank:** `service:auth-svc`

**Expected result:** 10 rows, timestamp + message from auth-svc logs.

**Success:**
> "Good. Logs are flowing. Whatever they did to the stack last week, this part still works."

**Wrong paths:**
- Wrong service name → 0 rows → hint: *"Nothing came back. The tag filter is exact — check the service name, including the hyphen."*
- Missing `service:` prefix (just `auth-svc`) → translator error → hint: *"That's not valid tag syntax. The format is `key:value` — try `service:auth-svc`."*

---

### Puzzle 02 — Find the phantom in logs

**Brief:**
> "Now the one I actually want. Same query, different service. Let's find out if it left a trace."

**Query:**
```sql
SELECT timestamp, message FROM logs(___) LIMIT 20
```
**Blank:** `service:chrono-portal-mirror`

**Expected result:** ~20 phantom log rows (LIMIT 20 of ~80 total).

**Success:**
> "Eighty rows. I ran it twice to make sure.
>
> That's not a ghost. A ghost is one event, maybe two, then nothing. Eighty rows means this service *ran*. Regularly. And nobody registered it."

**Wrong paths:**
- `auth-svc` or other valid service → different rows → hint: *"Those are real rows, but that's not the service we're looking for."*
- Unrecognized service → 0 rows → hint: *"Zero rows. The tag filter is exact — check the spelling."*

---

### Puzzle 03 — Error characterization

**Brief:**
> "How many of those are errors? I want to see just the errors, most recent first."

**Query:**
```sql
SELECT timestamp, message FROM logs(service:chrono-portal-mirror ___) ORDER BY timestamp DESC LIMIT 10
```
**Blank:** `level:error`

**Expected result:** ~10 error-level logs in reverse chronological order.

**Success:**
> "Eighty rows. Eighty errors.
>
> Not *some* errors. Not *mostly* errors. Every single log line from this service is an error. It ran for three hours, fired eighteen times, and failed every time. Something kept trying and kept failing and never stopped trying.
>
> That's not a bug. That's a design."

**Wrong paths:**
- `level:info` → 0 rows → hint: *"Zero rows — this service never logged at info level. Try something darker."*
- `level:warning` → 0 rows → hint: *"Zero rows. No warnings either. There's only one level in these logs."*

---

### Puzzle 04 — Introduce spans

**Brief:**
> "Logs tell you what a service *said*. Spans tell you what it *called* — what it talked to, how long each call took, whether the downstream responded.
>
> Different table. Same syntax. Fill in the source."

**Query:**
```sql
SELECT trace_id, operation, duration_ms, called_service FROM ___(service:chrono-portal-mirror) LIMIT 10
```
**Blank:** `spans`

**Expected result:** 10 span rows with trace_id, operation, duration_ms, called_service visible.

**Success:**
> "Different shape. You've got trace IDs, duration in milliseconds. And that last column — `called_service`.
>
> It was talking to something."

**Wrong paths:**
- `logs` → DuckDB error (no `called_service` column) → hint: *"That's the logs table — there's no `called_service` column in logs. I need the other one."*
- `metrics` → unknown PTF error → hint: *"We don't have a `metrics` PTF in scope here. Try `logs` or `spans`."*

---

### Puzzle 05 — Aggregate called_service

**Brief:**
> "Group those spans by what it was calling. I want counts."

**Query:**
```sql
SELECT called_service, COUNT(*) as call_count
FROM spans(service:chrono-portal-mirror)
GROUP BY ___
ORDER BY call_count DESC
```
**Blank:** `called_service`

**Expected result:** 2 rows — `chrono-archive` (31 calls), `chrono-ledger` (12 calls). (Exact counts determined by generator; ratio ~3:1.)

**Success:**
> "`chrono-archive`. `chrono-ledger`.
>
> Not external endpoints. Not a third-party API. Those are *ours*. `chrono-archive` is where we keep founding documents, old client contracts, everything that predates the digital catalog. `chrono-ledger` is the billing and engagement history going back to — nobody's checked how far back it goes.
>
> Thirty-one calls to `chrono-archive`. Twelve to `chrono-ledger`.
>
> It wasn't generating traffic. It was looking for something. In our oldest files."

**Wrong paths:**
- `service` → 1 row, wrong shape → hint: *"That's grouping by the service itself — you'd get one row. I want to know what it was calling, not which service it is."*
- `operation` → multiple rows, wrong data → hint: *"That's grouping by the operation name. I want to see the downstream services, not the call types."*

---

### Puzzle 06 — Catalog check

**Brief:**
> "One last thing. It's been running, it's been calling our systems, and nobody flagged it. So either it's registered and I missed it — or it isn't.
>
> Query the catalog. Service name."

**Query:**
```sql
SELECT * FROM services WHERE service_name = '___'
```
**Blank:** `chrono-portal-mirror`

**Expected result:** 0 rows (success condition).

**Success:**
> "Zero rows.
>
> It's in the logs. It's in the spans. It called our oldest document stores forty-three times in three hours.
>
> And it doesn't exist."

**Wrong paths:**
- A real service name (e.g. `auth-svc`) → rows returned → hint: *"That service exists. We're looking for one that doesn't."*

**Note on puzzle correctness:** P6 accepts any 0-row result as success — the educational point is that the service is absent from the catalog. Any misspelled or made-up name also returns 0 rows, which is fine (player still confirmed absence). The puzzle.json `expected` block should specify `row_count: 0`.

## Narrative beats

### Boss intro (`chapter.boss_intro`)

> "Something landed on my desk this morning. Face-down. She didn't say what it was and I didn't ask — you learn, after a while, which questions M. will actually answer.
>
> I turned it over after she left. Security badge. Old format, the kind we stopped issuing about eight years ago. The photo slot is empty. The name field has been redacted with a marker, but whoever did it was thorough — you can't read it in any light.
>
> I put it back face-down. Some things you look at when you're ready.
>
> Right now I need to know where this service shows up. Logs first. Give me ten rows from auth-svc — I want to make sure the pipeline's running before we look at anything that matters."

### Chapter outro

> Carol pulls up `chrono-archive` directly. Not through a query — she just opens the file browser.
>
> The founding documents are scanned images. She finds the incorporation record: two columns of signatures. The first column has names she recognizes. The second column is redacted — not digitally, but physically. Black marker, applied before the document was ever scanned.
>
> She checks three more copies. Same redaction, same hand, maybe. Consistent redaction is editorial. Someone decided this person doesn't exist, and they decided it before the documents went digital.
>
> She picks up the badge from her desk and turns it over again. The name field: same black marker. Same pressure.
>
> She tapes it to the whiteboard next to the six spike windows from last week.
>
> Forty-three calls to the oldest stores in the firm. Whatever it was looking for — it was looking in the parts nobody audits. The parts that predate the people who work here. The parts that predate *her*.
>
> M. knocked on her door an hour ago and asked if she'd found anything.
>
> Carol said not yet.

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
