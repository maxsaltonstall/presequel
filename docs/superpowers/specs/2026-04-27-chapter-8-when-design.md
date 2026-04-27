---
title: Chapter 8 — "When" — Design
date: 2026-04-27
status: draft
phase: Phase 2, Chapter 8 of 11
---

# Chapter 8 — "When" — Design

## Summary

Second chapter of Phase 2. Concept: **time windows and bucketing** in DDSQL — `@timestamp:[now-1h to now]` range filter and `bucket(field, interval)` grouping shorthand. Mechanic: typing (continues from Chapter 7). Setting: Chrono Consulting HQ, same morning; the CEO's three-word reply lands the chapter's dread beat. The investigation is directly motivated by M.'s closing command from Chapter 7: *"Find me the seconds."*

## Goals

- Teach DDSQL `@timestamp:[A to B]` time-window filter syntax.
- Teach `bucket(field, interval)` as a grouping shorthand for `DATE_TRUNC`.
- Introduce the `timeWindow` and `bucket` translator stages in `server/ddsql.js`.
- Deepen the coordination-pattern slow burn: phantom timestamps coincide with error spikes at the same seconds.
- Advance M.'s presence — she replies with three words that confirm she already knows the answer.

## Non-goals

- `now-` relative syntax beyond `now`, `now-Xh`, `now-Xm`, `now-Xs`.
- Absolute ISO timestamp range syntax (e.g., `@timestamp:[2026-04-26T08:00:00 to ...]`) — save for a later chapter if needed.
- `bucket()` intervals beyond `1s`, `1m`, `1h`.
- Any DDSQL forms from later chapters (rates, PTFs, joins).

## Mechanic — typing (no new mode)

`mechanic_mode: "typing"` continues from Chapter 7. No renderer changes needed.

## Translator — two new stages

Both stages are pure functions `(string) → string`, added to `server/ddsql.js` and exported. They compose with the existing `translateTagFilter` stage.

### Stage 1: `translateTimeWindow(sql)`

Rewrites `@timestamp:[A to B]` patterns found inside WHERE clause bodies.

#### `now` anchor

`seed.sql` sets a DuckDB session variable:

```sql
SET VARIABLE ch8_anchor = TIMESTAMP '2026-04-26 11:00:00';
```

The translator replaces `now` with `getvariable('ch8_anchor')` and relative offsets with interval arithmetic:

| DDSQL token | DuckDB output |
|---|---|
| `now` | `getvariable('ch8_anchor')` |
| `now-1h` | `getvariable('ch8_anchor') - INTERVAL '1 hour'` |
| `now-30m` | `getvariable('ch8_anchor') - INTERVAL '30 minutes'` |
| `now-5m` | `getvariable('ch8_anchor') - INTERVAL '5 minutes'` |
| `now-3h` | `getvariable('ch8_anchor') - INTERVAL '3 hours'` |

#### Translation table

| DDSQL input | DuckDB output |
|---|---|
| `@timestamp:[now-1h to now]` | `timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hour' AND timestamp <= getvariable('ch8_anchor')` |
| `@timestamp:[now-3h to now]` | `timestamp >= getvariable('ch8_anchor') - INTERVAL '3 hours' AND timestamp <= getvariable('ch8_anchor')` |
| `@timestamp:[now-2h to now-1h]` | `timestamp >= getvariable('ch8_anchor') - INTERVAL '2 hours' AND timestamp <= getvariable('ch8_anchor') - INTERVAL '1 hour'` |
| `@timestamp:[now-5m to now]` | `timestamp >= getvariable('ch8_anchor') - INTERVAL '5 minutes' AND timestamp <= getvariable('ch8_anchor')` |

#### Behaviour rules

- Only rewrites `@timestamp` (the reserved attribute). Other `@`-prefixed identifiers pass through.
- The `to` separator is case-insensitive.
- Whitespace inside the brackets is trimmed before parsing.
- If the bracket content does not match a recognised pattern, the token passes through unchanged (no throw — produce a no-match rather than a server error).
- `@timestamp` can co-exist with tag filters in the same WHERE clause; `translateTagFilter` runs first and does not touch `@`-prefixed tokens.

### Stage 2: `translateBucket(sql)`

Rewrites `bucket(<field>, <interval>)` globally (not scoped to WHERE — it can appear in SELECT, GROUP BY, ORDER BY).

| DDSQL input | DuckDB output |
|---|---|
| `bucket(timestamp, 1s)` | `DATE_TRUNC('second', timestamp)` |
| `bucket(timestamp, 1m)` | `DATE_TRUNC('minute', timestamp)` |
| `bucket(timestamp, 1h)` | `DATE_TRUNC('hour', timestamp)` |

#### Behaviour rules

- Field name can be any identifier (not hard-coded to `timestamp`).
- Interval token is case-insensitive: `1M`, `1H`, `1S` are accepted.
- Unrecognised intervals pass through unchanged.
- The function name `bucket` is case-insensitive.

### Pipeline (updated)

```
player input
  → translateTagFilter()
  → translateTimeWindow()
  → translateBucket()
  → validateSql()
  → DuckDB
```

All three stages are pure; each receives the output of the prior stage.

### Test contract

`tests/ddsql-time-window.test.js`:
- `@timestamp:[now-1h to now]` → correct DuckDB output
- `@timestamp:[now-3h to now]` → correct DuckDB output
- `@timestamp:[now-2h to now-1h]` → both bounds translated
- `@timestamp:[now-5m to now]` → minutes unit
- Pass-through: no `@timestamp` in SQL → unchanged
- Pass-through: `@timestamp` with unrecognised bracket content → unchanged
- `bucket(timestamp, 1m)` in SELECT → `DATE_TRUNC('minute', timestamp)`
- `bucket(timestamp, 1h)` → `DATE_TRUNC('hour', timestamp)`
- `bucket(timestamp, 1s)` → `DATE_TRUNC('second', timestamp)`
- `bucket` in GROUP BY position → correctly rewritten
- Pass-through: `bucket` with unrecognised interval → unchanged
- Composition: query with both `@timestamp` and `bucket` rewrites correctly

## Data — `logs` parquet, ~3000 rows

### Schema

Same as Chapter 7:

```sql
CREATE TABLE logs (
  timestamp  TIMESTAMP,
  message    VARCHAR,
  tags       MAP(VARCHAR, VARCHAR)
);
```

Same tag keys: `service`, `env`, `host`, `level`, `status`, `region`.

### Time range

`2026-04-26 08:00:00` to `2026-04-26 11:00:00` UTC — a 3-hour window.

Anchor: `2026-04-26 11:00:00` (the end of the range, set in `seed.sql`).

This means:
- `@timestamp:[now-3h to now]` → entire dataset (~3000 rows)
- `@timestamp:[now-1h to now]` → last hour, `10:00–11:00` (~1000 rows)
- `@timestamp:[now-5m to now]` → `10:55–11:00`, the spike window (~200 rows)

### Temporal distribution

- Hours 08:00–10:45: steady background noise (~55 rows/minute)
- 10:45–10:55: moderate increase (~80 rows/minute)
- 10:55–11:00: visible spike (~130 rows/minute) — the anomaly zone
- Error density normal throughout except in the spike zone, where certain seconds have 3–5× normal error density

### Phantom rows

**4 rows** from `chrono-portal-mirror`, all within the spike window (`10:55–11:00`). Their `timestamp` values (to the second) coincide exactly with the highest-error-density seconds from other services. This is the coordination signal the player surfaces in Puzzle 06.

Phantom messages (same cryptic style as Chapter 7):
- `"sync frame received"`
- `"transit lock confirmed"`
- `"mirror write ok"`
- `"handoff complete"`

All 4 phantom rows have `level: 'info'` — they don't show up as errors, making their timing coincidence with error spikes more unsettling.

### Sanity checks (in the generator)

- Total rows exactly 3000
- `chrono-portal-mirror` count exactly 4
- All 4 phantom timestamps fall within the spike window (`10:55–11:00`)
- At least 2 phantom timestamps match a second where error count ≥ 3 in other services
- All timestamps fall within `[08:00:00, 11:00:00]`

### `seed.sql`

```sql
SET VARIABLE ch8_anchor = TIMESTAMP '2026-04-26 11:00:00';
CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/08-when/data/logs.parquet');
```

### Generator

`scripts/generate-ch8-logs.js` — same pattern as `scripts/generate-logs.js`. Deterministic (fixed `START_TS_MS`). Writes `content/chapters/08-when/data/logs.parquet`.

## Puzzle arc

| # | Concept | Player query | Reveals |
|---|---|---|---|
| 01 | Data orientation | `SELECT MIN(timestamp) AS start, MAX(timestamp) AS end FROM logs` | 3-hour span. No new syntax. |
| 02 | `@timestamp` window | `SELECT * FROM logs WHERE @timestamp:[now-1h to now] LIMIT 20` | First time-window filter. ~1000 rows in the last hour. |
| 03 | Bucket by minute | `SELECT bucket(timestamp, 1m) AS minute, COUNT(*) AS n FROM logs WHERE @timestamp:[now-1h to now] GROUP BY minute ORDER BY minute` | Activity by minute. One minute near 10:57 is clearly busier. |
| 04 | Zoom into spike | `SELECT * FROM logs WHERE @timestamp:[now-5m to now]` | ~200 rows in the hot window. The phantom appears here. |
| 05 | Errors by second | `SELECT bucket(timestamp, 1s) AS second, COUNT(*) AS n FROM logs WHERE @timestamp:[now-5m to now] AND level:error GROUP BY second ORDER BY second` | Certain seconds have 3–5× normal error density. |
| 06 | Phantom's seconds | `SELECT timestamp, message FROM logs WHERE service:chrono-portal-mirror ORDER BY timestamp` | 4 rows. Timestamps match the high-density seconds from Puzzle 05 exactly. |

Expected counts are locked in by the generator's distribution.

All `expected.sql` values in puzzle JSONs use **fully translated DuckDB syntax**, not DDSQL, because `validate-content.js` runs them directly against DuckDB without going through the translator. This means:
- `@timestamp:[now-1h to now]` → `timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hour' AND timestamp <= getvariable('ch8_anchor')`
- `bucket(timestamp, 1m)` → `DATE_TRUNC('minute', timestamp)`
- `level:error` → `tags['level'] = 'error'`

Puzzle 05's `expected.sql` must combine all three translations: the timestamp range, the `DATE_TRUNC` bucket, and the tag filter — all in DuckDB form.

## Narrative — first draft

### Cold open (Carol)

> M.'s reply is taped above the corkboard — printout from this morning, three words in Carol's handwriting: *"I know that time."*
>
> Carol doesn't explain what she sent. She pulls up a terminal.
>
> "She told us to find the seconds. We found them. She already knew. Which means whoever built `chrono-portal-mirror` has a schedule — and M. has seen it before."
>
> She opens the log dataset. "We have three hours of data. Eight to eleven. DDSQL time filter is `@timestamp` — open bracket, start, `to`, end, close bracket. `now` means the end of this dataset. We work backwards from there."

### Per-puzzle dialogue

**Puzzle 01 — "What hours"**
- *brief*: Carol: "First things first. Show me the time range we're working with. MIN and MAX of timestamp."
- *success*: Carol: "Eight to eleven. Three hours. Whoever was moving, they were moving in that window."

**Puzzle 02 — "Last hour"**
- *brief*: Carol: "Start with the last hour. `@timestamp:[now-1h to now]` — brackets, `to` between the bounds. Limit to twenty so we can read it."
- *success*: Carol: "About a thousand rows. Normal background. Keep narrowing."

**Puzzle 03 — "By the minute"**
- *brief*: Carol: "Bucket the last hour by minute. `bucket(timestamp, 1m)` — that's `DATE_TRUNC` in plain SQL, but shorter. Count per bucket, order by time."
- *success*: Carol: "Fifty-seven minutes in. Something happened there."

**Puzzle 04 — "Into the spike"**
- *brief*: Carol: "Last five minutes. That's the spike. Show me everything."
- *success*: Carol: "Two hundred rows. `chrono-portal-mirror` is in here. Four logs."

**Puzzle 05 — "Which seconds"**
- *brief*: Carol: "Bucket by second. Errors only. Last five minutes. I want to see which seconds had the most noise."
- *success*: Carol: "Four seconds. Four seconds in a five-minute window where errors spike. That's not random."

**Puzzle 06 — "The phantom's timestamps"**
- *brief*: Carol: "Pull the phantom's logs. All four. I want to see the exact timestamps."
- *success*: Carol looks at the two result sets side by side. The four phantom timestamps. The four spike seconds. Exact matches.
  > "Those seconds. She already knew which ones."

### Outro / Chapter 9 stinger

> Carol writes the four spike-seconds on a Post-it and sticks it to the corkboard next to the phantom service rows. She photographs it — already sent it, apparently. Her phone is face-down on the desk.
>
> "Okay. So she knew before we looked. Which means whoever this is — whatever `chrono-portal-mirror` is — it's not new. It's been running long enough that M. has a history with it."
>
> She pulls up the traffic graphs. "I want to know how fast it moves. Not just when — how much, and how fast."

## Engine changes

| Component | Change |
|---|---|
| `server/ddsql.js` | Add `translateTimeWindow(sql)` and `translateBucket(sql)` exports |
| `server.js` | Pipe through both new stages after `translateTagFilter` |
| `tests/ddsql-time-window.test.js` | New — 12 unit tests covering both stages |
| `scripts/generate-ch8-logs.js` | New — deterministic parquet generator |
| `content/chapters/08-when/data/logs.parquet` | Generated, committed |
| `content/chapters/08-when/seed.sql` | New — sets `ch8_anchor`, loads parquet |
| `content/chapters/08-when/chapter.json` | New — chapter metadata and narrative |
| `content/chapters/08-when/puzzles/01.json` – `06.json` | New — 6 puzzles |
| `content/reference/time-windows.md` | New — reference doc for `@timestamp` and `bucket()` |
| `src/main.js` | Append `'08-when'` to `CHAPTER_ORDER` |
| `src/reference.js` | Add `'08-when'` entry to `CONCEPTS_FOR_CHAPTER` |
| `tests/e2e-smoke.spec.js` | Append Chapter 8 Puzzle 01 walkthrough |
| `docs/playtest-checklist.md` | Append Chapter 8 section |

## Reference markdown

`content/reference/time-windows.md` — concept slug `time-windows`, introduced in `08-when`.

Covers:
- `@timestamp:[now-1h to now]` — the window filter form
- Supported relative offsets: `now`, `now-Xh`, `now-Xm`, `now-Xs`
- `bucket(field, interval)` — grouping shorthand
- Supported intervals: `1s`, `1m`, `1h`
- Note: `now` is anchored to the dataset's end time, not the wall clock

## Testing

| What | How |
|---|---|
| Translator unit tests | `tests/ddsql-time-window.test.js` — 12 input/output pairs |
| Content validator | `npm run validate-content` — runs each puzzle's `expected.sql` directly against seeded DuckDB |
| Generator invariants | `scripts/generate-ch8-logs.js` throws if invariants fail |
| Playwright smoke | Extend `tests/e2e-smoke.spec.js` with Chapter 8 Puzzle 01 walkthrough |
| Manual playtest | Append Chapter 8 section to `docs/playtest-checklist.md` |

## Open questions resolved

- **`@timestamp` with stale parquet**: Resolved via seed.sql anchor variable (`ch8_anchor`). `now` = end of dataset.
- **Bucketing syntax**: `bucket(field, interval)` DDSQL shorthand → `DATE_TRUNC`. Three supported intervals: `1s`, `1m`, `1h`.
- **Data source**: New parquet for Chapter 8 — temporal structure purpose-built for time-window teaching.
- **Phantom count**: 4 rows (vs. 6 in Chapter 7). All within the spike window. All timestamps match error-spike seconds.
