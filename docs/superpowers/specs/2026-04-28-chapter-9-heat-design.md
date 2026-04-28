# Chapter 9 "Heat" — Design Spec

## Overview

Chapter 9 introduces `rate(field, 1m)` — a DDSQL function that converts a pre-aggregated per-minute count into events per second. The data is a pre-aggregated metrics table (one row per minute per service) rather than raw logs. The player discovers that `chrono-portal-mirror` runs in rhythmic 18-minute bursts — scheduled, not random — and that every burst carries errors.

**What's new vs. Ch8:**
- New table schema: `metrics(minute TIMESTAMP, service VARCHAR, n INTEGER, errors INTEGER)` — no tags column, no MAP access
- New translator function: `translateRate` — `rate(n, 1m)` → `ROUND(n / 60.0, 2)`
- Pipeline position: innermost — `translateBucket(translateTagFilter(translateTimeWindow(translateRate(sql))))`
- New reference concept: `rate`
- No new mechanic — still typing mode

**Carol's closing line:** "M. was right about the seconds. Now she wants the rate."

---

## Data

**File:** `content/chapters/09-heat/data/metrics.parquet`  
**Generator:** `scripts/generate-ch9-metrics.js`

**Schema:** `(minute TIMESTAMP, service VARCHAR, n INTEGER, errors INTEGER)`

**Time window:** 2026-04-26 10:00:00 to 11:59:00 UTC (120 minutes)  
**Anchor variable:** `ch9_anchor = TIMESTAMP '2026-04-26 12:00:00'`

**Services (6):** `auth-svc`, `api-gateway`, `payment-svc`, `billing-svc`, `notification-svc`, `chrono-portal-mirror`

**Row count:** 6 × 120 = 720 rows exactly

**Quiet service baselines** (per minute, deterministic seed):
- `n`: 10–30
- `errors`: 0–2

**chrono-portal-mirror baseline** (non-spike minutes):
- `n`: 2–5, `errors`: 0

**Spike minutes** — 6 total, at offsets 15, 33, 51, 69, 87, 105 from 10:00 (every 18 minutes):
- `n`: 150–200, `errors`: 20–30
- Spike `rate(n, 1m)` ≈ 2.5–3.3 rps (above `> 1.0` threshold)
- Quiet `rate(n, 1m)` ≤ 0.50 rps (below threshold)

**Sanity checks in generator (throw on violation):**
1. Exactly 720 rows
2. Exactly 6 spike rows for chrono-portal-mirror
3. All spike rows have `n > 60` (i.e. `rate > 1.0`)
4. All non-spike rows for chrono-portal-mirror have `n <= 60`
5. All `minute` values fall within [10:00:00, 11:59:00]

---

## Translator

New export in `server/ddsql.js`:

```js
export function translateRate(sql) {
  return sql.replace(/\brate\s*\(\s*(\w+)\s*,\s*1m\s*\)/gi, (_, field) =>
    `ROUND(${field} / 60.0, 2)`
  );
}
```

Pipeline update in `server.js`:
```js
const translated = translateBucket(translateTagFilter(translateTimeWindow(translateRate(sql))));
```

`translateRate` runs first (innermost). No interaction risk with other translators — `rate(...)` patterns don't overlap with `@timestamp:[...]`, tag `key:value`, or `bucket(...)` patterns.

---

## Content Files

### seed.sql

```sql
SET VARIABLE ch9_anchor = TIMESTAMP '2026-04-26 12:00:00';
CREATE TABLE metrics AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/09-heat/data/metrics.parquet');
```

### chapter.json

- id: `09-heat`, ordinal: 9, title: `Heat`, mechanic_mode: `typing`
- concepts_introduced: `["rate"]`
- concepts_reviewed: `["select", "from", "where", "group-by", "order-by"]`
- puzzle_ids: `["01", "02", "03", "04", "05", "06"]`

### Puzzles

All puzzles use typing mode with 1 blank each.

| # | Blank | Correct answer | Expected rows | Key wrong-path |
|---|-------|----------------|---------------|----------------|
| 01 | table name | `metrics` | 10 | error on wrong table name |
| 02 | field in `rate([blank], 1m) AS rps` | `n` | 20 | wrong field → different values |
| 03 | GROUP BY column | `service` | 6 | wrong column → wrong shape |
| 04 | service name in WHERE | `'chrono-portal-mirror'` | 120 | wrong service → wrong count |
| 05 | threshold in `rate(n, 1m) > [blank]` | `1.0` | 6 | too high → 0 rows; too low → >6 rows |
| 06 | second rate field | `errors` | 6 | wrong field → different values |

**expected.sql values (DuckDB syntax — no DDSQL):**

Puzzle 01: `SELECT * FROM metrics LIMIT 10`

Puzzle 02: `SELECT minute, service, ROUND(n / 60.0, 2) AS rps FROM metrics ORDER BY rps DESC LIMIT 20`

Puzzle 03: `SELECT service, MAX(ROUND(n / 60.0, 2)) AS peak_rps FROM metrics GROUP BY service ORDER BY peak_rps DESC`

Puzzle 04: `SELECT minute, ROUND(n / 60.0, 2) AS rps FROM metrics WHERE service = 'chrono-portal-mirror' ORDER BY minute`

Puzzle 05: `SELECT minute, ROUND(n / 60.0, 2) AS rps FROM metrics WHERE service = 'chrono-portal-mirror' AND ROUND(n / 60.0, 2) > 1.0 ORDER BY minute`

Puzzle 06: `SELECT minute, ROUND(n / 60.0, 2) AS rps, ROUND(errors / 60.0, 2) AS err_rps FROM metrics WHERE service = 'chrono-portal-mirror' AND ROUND(n / 60.0, 2) > 1.0 ORDER BY minute`

---

## Reference

New file: `content/reference/rate.md`

```markdown
---
concept: rate
title: rate()
---

`rate(field, 1m)` converts a per-minute count into events per second.

​```sql
SELECT minute, service, rate(n, 1m) AS rps
FROM metrics
ORDER BY rps DESC
​```

The `1m` interval matches the bucket size of the data. Divides by 60 and rounds to two decimal places.

Use it anywhere a column appears: SELECT, WHERE, ORDER BY, inside aggregates like MAX or AVG.
```

### Engine wiring

`src/main.js`: append `'09-heat'` to `CHAPTER_ORDER`

`src/reference.js`: add entry:
```js
'09-heat': ['select', 'from', 'where', 'group-by', 'order-by', 'ddsql-tags', 'time-windows', 'count', 'rate'],
```

---

## Testing

**Unit tests** (`tests/ddsql-rate.test.js`) — 9 tests:
1. `rate(n, 1m)` → `ROUND(n / 60.0, 2)`
2. `rate(errors, 1m)` → `ROUND(errors / 60.0, 2)`
3. Case-insensitive: `RATE(n, 1M)` → `ROUND(n / 60.0, 2)`
4. Inside SELECT: `SELECT service, rate(n, 1m) AS rps` → correct substitution
5. Inside WHERE: `rate(n, 1m) > 1.0` → `ROUND(n / 60.0, 2) > 1.0`
6. Inside MAX: `MAX(rate(n, 1m))` → `MAX(ROUND(n / 60.0, 2))`
7. No match: `rate(n, 5m)` → unchanged
8. No match: `rate(n)` → unchanged
9. Composition: `translateRate` output survives `translateTagFilter` unchanged

**E2E smoke test** — append to `tests/e2e-smoke.spec.js`:
- Set localStorage with chapters 01–08 completed
- Navigate to `http://localhost:5173`
- Expect Ch9 Puzzle 01 brief to contain a phrase from Carol's intro (use a distinctive substring from the brief text written in `puzzles/01.json`)
- Fill blank with `metrics`
- Click Run
- Expect success bubble

**Content validation:** `npm run validate-content` picks up Ch9 automatically — no changes needed.

**Generator:** throws on any sanity violation before writing parquet.
