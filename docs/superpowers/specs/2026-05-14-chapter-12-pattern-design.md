---
title: Chapter 12 "The Pattern" — Design Spec
date: 2026-05-14
status: approved
phase: Phase 1.5 (Chapters 12+)
---

# Chapter 12 "The Pattern" — Design Spec

## Summary

Chapter 12 opens Phase 1.5. M. is still in the room after her revelation at the end of Ch11. Carol uses window functions — `ROW_NUMBER() OVER` and `LAG() OVER` — to sequence events and measure gaps between them. The key discovery: `chrono-portal-mirror` fires on an exact 18-minute schedule; `log-sync-svc` is irregular, not scheduled. M. watches Carol work. At the end, she confesses: she built `chrono-portal-mirror` before the firm had a name, to keep a copy of the founding records somewhere safe. She still doesn't trust that what they built will last.

## Concept area

**Window functions** — `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` and `LAG(col) OVER (PARTITION BY ... ORDER BY ...)`.

No new translator stage needed. DuckDB handles `OVER (PARTITION BY ... ORDER BY ...)` natively; the existing pipeline passes window function syntax unchanged. This is a pure content chapter.

Window functions taught:
- `ROW_NUMBER()` — assigns a sequential integer to each row within a window
- `PARTITION BY` — resets the window counter per group
- `LAG(col)` — returns the value of `col` from the previous row in the window (NULL for the first row)
- Interval arithmetic: `timestamp - LAG(timestamp) OVER (...)` returns a DuckDB INTERVAL

Not in scope: `LEAD`, `RANK`, `DENSE_RANK`, `SUM() OVER`, `AVG() OVER` — reserved for future chapters.

## Mechanic

Typing (same as Ch10–11). No new mechanic mode.

## Architecture

### No new translator stage

Window function syntax (`OVER`, `PARTITION BY`, `ROW_NUMBER()`, `LAG()`) is standard DuckDB SQL. The existing pipeline passes it through unchanged. No changes to `server/ddsql.js` or `server.js`.

### Files touched

| File | Change |
|---|---|
| `src/main.js` | Append `'12-pattern'` to `CHAPTER_ORDER` |
| `src/reference.js` | Add `'12-pattern'` concept block (10 slugs) |
| `content/chapters/12-pattern/` | New chapter directory (all content files) |
| `content/reference/window-functions.md` | New reference doc |
| `scripts/generate-ch12-data.js` | Data generator |
| `tests/e2e-smoke.spec.js` | Append Ch12 smoke test |
| `docs/playtest-checklist.md` | Append Ch12 section; fix Ch11 outro note |

`server/ddsql.js`, `server.js`, `server/security.js`, `server/duckdb.js`, `src/puzzle.js` — no changes.

## Data shape

One table: `logs` (~480 rows). Window functions teach best on a single ordered table — no `spans` table needed.

### `logs` (~480 rows)
- Columns: `timestamp TIMESTAMP`, `message VARCHAR`, `tags MAP(VARCHAR, VARCHAR)`
- Tags: `service`, `level`, `env`
- **`chrono-portal-mirror`**: exactly 60 rows, spaced ~18 minutes apart (1080 seconds), all `level:error`. Timestamps span a 3-hour main window (`2026-04-26 09:00 UTC` to `12:00 UTC`). Gap variance ≤ 5 seconds — unmistakably regular.
- **`log-sync-svc`**: exactly 40 rows, irregular spacing — gaps ranging from 2 minutes to 4 hours. Not a scheduled job.
- **5 normal services** (`auth-svc`, `api-gateway`, `chrono-archive`, `chrono-ledger`, `metrics-collector`): 76 rows each (380 total), evenly distributed across the window.

### `services` (12 rows, inline SQL in seed.sql)
Identical to Ch11: same 12 registered services, neither `chrono-portal-mirror` nor `log-sync-svc` registered.

### Ghost profiles
- **`chrono-portal-mirror`**: 18-minute clock. min_gap ≈ max_gap ≈ avg_gap ≈ 18 minutes. Built by M. as a scheduled audit mirror.
- **`log-sync-svc`**: irregular. min_gap ~2 min, max_gap ~4 hours, avg_gap ~40 min. Not a scheduled job — reactive or manual triggering.

### Generator script
`scripts/generate-ch12-data.js` — deterministic, same pattern as Ch11 generator. Produces `data/logs.parquet`. No spans parquet needed.

## Puzzle arc

### Puzzle 01 — ROW_NUMBER basics (warm-up)

**Brief:**
> "Tell me what order these came in."

**Query:**
```sql
SELECT timestamp, tags['service'] as service, ROW_NUMBER() OVER (___) as rn
FROM logs
WHERE tags['service'] = 'log-sync-svc'
LIMIT 10
```
**Blank:** `ORDER BY timestamp`

**Expected result:** 10 rows with `rn` values 1–10 in timestamp order.

**Success:**
> "Row numbers. Simplest window function there is. It doesn't aggregate — it annotates. Every row keeps its data and gets a number."

**Wrong paths:**
- Missing `ORDER BY` → DuckDB error → hint: *"The OVER clause needs an order — try ORDER BY timestamp."*
- `PARTITION BY tags['service']` without ORDER BY → error → hint: *"Add ORDER BY timestamp after the PARTITION BY."*

---

### Puzzle 02 — PARTITION BY

**Brief:**
> "Same thing. One counter per service, not one counter for everything."

**Query:**
```sql
SELECT timestamp, tags['service'] as service,
  ROW_NUMBER() OVER (PARTITION BY ___ ORDER BY timestamp) as rn
FROM logs
LIMIT 20
```
**Blank:** `tags['service']`

**Expected result:** ~20 rows with `rn` resetting to 1 for each new service.

**Success:**
> "Partition resets the counter. Each service starts at 1."

**Wrong paths:**
- `service` (alias) → DuckDB error (alias not available in OVER) → hint: *"Use the full expression — tags['service']."*
- Missing PARTITION BY entirely → counter doesn't reset → hint: *"Partition by the service tag to get one counter per service."*

---

### Puzzle 03 — First event per service

**Brief:**
> "When did each service first appear?"

**Query:**
```sql
SELECT service, first_seen
FROM (
  SELECT tags['service'] as service, timestamp as first_seen,
    ROW_NUMBER() OVER (PARTITION BY tags['service'] ORDER BY timestamp) as rn
  FROM logs
)
WHERE ___
```
**Blank:** `rn = 1`

**Expected result:** 7 rows (5 normal services + 2 ghosts), one per service, earliest timestamp each.

**Success:**
> "There. Every service's first log line. log-sync-svc's is twenty-nine days before the others start spiking. Not a coincidence."

**Wrong paths:**
- `rn > 1` → all non-first rows → hint: *"I want the first row per service — rn = 1."*
- Missing WHERE → all rows → hint: *"Filter to just the first row per service."*

---

### Puzzle 04 — LAG intro

**Brief:**
> "Show me what came before each event."

**Query:**
```sql
SELECT timestamp, tags['service'] as service,
  LAG(___) OVER (PARTITION BY tags['service'] ORDER BY timestamp) as prev_ts
FROM logs
WHERE tags['service'] = 'chrono-portal-mirror'
LIMIT 10
```
**Blank:** `timestamp`

**Expected result:** 10 rows; `prev_ts` is NULL for the first row, then the previous timestamp for each subsequent row.

**Success:**
> "LAG looks backward. For each row, it reaches to the previous one and pulls a value across. The first row gets NULL — there's nothing before it."

**Wrong paths:**
- `message` → returns previous message string → hint: *"I want the previous timestamp — try LAG(timestamp)."*
- Empty LAG `()` → DuckDB error → hint: *"LAG needs a column — try LAG(timestamp)."*

---

### Puzzle 05 — Gap between events

**Brief:**
> "How far apart are they?"

**Query:**
```sql
SELECT timestamp, tags['service'] as service,
  timestamp - LAG(timestamp) OVER (PARTITION BY tags['service'] ORDER BY timestamp) as gap
FROM logs
WHERE tags['service'] = 'chrono-portal-mirror'
ORDER BY ___
```
**Blank:** `timestamp`

**Expected result:** ~60 rows; `gap` column shows intervals of ~18 minutes for all non-NULL rows.

**Success:**
> "Eighteen minutes. Eighteen minutes. Eighteen minutes."
>
> M. turns around for the first time.

**Wrong paths:**
- `gap DESC` or `gap` → different ordering (NULLs first, irregular) → hint: *"Order by timestamp to see the events in sequence."*
- Missing ORDER BY entirely → DuckDB error → hint: *"Add ORDER BY timestamp to see events in order."*

---

### Puzzle 06 — Both ghosts side by side

**Brief:**
> "Same query. Both of them."

**Query:**
```sql
SELECT timestamp, tags['service'] as service,
  timestamp - LAG(timestamp) OVER (PARTITION BY tags['service'] ORDER BY timestamp) as gap
FROM logs
WHERE tags['service'] IN (___)
ORDER BY tags['service'], timestamp
```
**Blank:** `'chrono-portal-mirror', 'log-sync-svc'`

**Expected result:** ~100 rows showing both ghosts; chrono-portal-mirror gaps are uniform ~18 min, log-sync-svc gaps are irregular.

**Success:**
> "Look at them next to each other. One is a metronome. The other is chaos. These aren't the same kind of thing."
>
> She crosses the room to stand next to Carol. For the first time, she looks directly at the screen.

**Wrong paths:**
- Only one service name → partial result → hint: *"Include both service names in the IN list."*
- `=` instead of `IN` → only one service → hint: *"Use IN (...) to match both service names."*

---

### Puzzle 07 — Boss fight: characterize the pattern

**Brief:**
> "Give me min, max, and average gap for each. One row per service."

**Query:**
```sql
SELECT service, MIN(gap) as min_gap, MAX(gap) as max_gap, AVG(gap) as avg_gap
FROM (
  SELECT tags['service'] as service,
    timestamp - LAG(timestamp) OVER (PARTITION BY tags['service'] ORDER BY timestamp) as gap
  FROM logs
  WHERE tags['service'] IN ('chrono-portal-mirror', 'log-sync-svc')
)
WHERE ___
GROUP BY service
ORDER BY avg_gap
```
**Blank:** `gap IS NOT NULL`

**Expected result:** 2 rows. `chrono-portal-mirror`: min/max/avg all ~00:18:00. `log-sync-svc`: wide spread, avg ~00:40:00.

**Success:**
> "Eighteen minutes. Exactly. That's not drift — I set it. I built that service before the firm had a name. It reads the founding records and writes a copy somewhere safe. I didn't trust that what we were building would last."
>
> She turns back to the window.
>
> "I still don't."
>
> Carol looks at the whiteboard. Two badges. One name she now knows. One she doesn't.
>
> She opens a new query tab.

**Wrong paths:**
- Missing WHERE → NULL rows included in AVG → hint: *"Filter out the NULL gaps — the first row per service has no previous event."*
- `gap IS NULL` → only NULLs → hint: *"I want the rows that have a gap — gap IS NOT NULL."*

**Note on P7:** The subquery is provided in the template. The blank is only `gap IS NOT NULL`. The player applies a pattern they've seen (IS NOT NULL from Ch11's anti-join) to a new context.

## Narrative beats

### Boss intro (`chapter.boss_intro`)

> M. hasn't left.
>
> She's standing at the window, back to the room. Carol is still at the whiteboard. Neither of them has said anything for three minutes.
>
> Carol pulls up a new query tab.
>
> "You want to know when it started," M. says, without turning around. Not a question.
>
> Carol types.
>
> "Run the query."

### P5 success — the clock

> "Eighteen minutes. Eighteen minutes. Eighteen minutes."
>
> M. turns around for the first time.

*(The gap columns on screen all read ~00:18:00.)*

### P6 success — the contrast

> "Look at them next to each other. One is a metronome. The other is chaos. These aren't the same kind of thing."
>
> She crosses the room to stand next to Carol. For the first time, she looks directly at the screen.

### P7 success / chapter outro

> "Eighteen minutes. Exactly. That's not drift — I set it. I built that service before the firm had a name. It reads the founding records and writes a copy somewhere safe. I didn't trust that what we were building would last."
>
> She turns back to the window.
>
> "I still don't."
>
> Carol looks at the whiteboard. Two badges. One name she now knows. One she doesn't.
>
> She opens a new query tab.

### Auto-advance

Chapter 12 does NOT auto-advance (Ch13 not yet planned).

## Reference drawer

**Ch12 concepts (10 slugs):** select, from, where, group-by, order-by, ddsql-tags, inner-join, tag-join, is-null, window-functions

**New reference doc:** `content/reference/window-functions.md`
- What window functions are (annotate rows without collapsing them — contrast with GROUP BY)
- `ROW_NUMBER() OVER (ORDER BY ...)` syntax and behavior
- `PARTITION BY` — resetting the window per group
- `LAG(col) OVER (...)` — pulling the previous row's value; NULL for first row
- Interval arithmetic: `timestamp - LAG(timestamp) OVER (...)` → DuckDB INTERVAL
- First-per-group pattern: subquery + `WHERE rn = 1`

## Testing

### No translator unit tests

No new translator stage → no new unit test file. Existing 57 tests unchanged.

### E2E smoke test (appended to `tests/e2e-smoke.spec.js`)

- Seed Ch1–11 completed in localStorage
- Land on Ch12 P1
- Check 2 bubbles: boss intro + P1 brief
- Brief contains "order"
- Fill typed input: `ORDER BY timestamp`
- Run → expect success bubble

### Playtest checklist additions

New Ch12 section covering:
- All 7 puzzles: correct path + at least one wrong path each
- P3 note: subquery pattern — blank is only `rn = 1`
- P5 note: success text "Eighteen minutes" appears three times; M. turns around
- P7 note: subquery provided in template — blank is only `gap IS NOT NULL`
- Reference drawer: 10 concepts visible, window-functions entry renders
- Ch11 outro note updated: "auto-advances to Chapter 12"

### Content validator

Existing `npm run validate-content` exercises each puzzle's canonical query through the full translator + DuckDB pipeline.
