---
title: Chapter 11 "The Catalog" — Design Spec
date: 2026-05-01
status: approved
phase: Phase 2 (Chapters 7–11)
---

# Chapter 11 "The Catalog" — Design Spec

## Summary

Chapter 11 is the Phase 2 finale. The player learns tag-based JOIN syntax to cross-reference telemetry sources with the services catalog. The LEFT JOIN reveals two unregistered services — `chrono-portal-mirror` (already known) and `log-sync-svc` (new, active, moving data somewhere). Carol names them both. M. walks in at the end, looks at the whiteboard, and says: "One of these I put here." She doesn't say which one. She doesn't say when.

## Concept area

**Tag-based JOINs** — `FROM logs JOIN services ON tags.service = service_name`. Dot-notation shorthand for tag map access in JOIN ON clauses. New translator stage `translateTagJoin` converts to plain DuckDB `FROM logs JOIN services ON logs.tags['service'] = services.service_name`.

JOIN types in scope: `INNER JOIN` and `LEFT JOIN`. PTF syntax (`logs()`) not used in Ch11 puzzles — filtering goes through the existing WHERE + `translateTagFilter` path.

## Mechanic

Typing (same as Ch7–10). No new mechanic mode.

## Architecture

### New translator stage: `translateTagJoin()`

Detects `tags.<key>` dot-notation in JOIN ON clauses, infers the source table from the surrounding FROM clause, and rewrites to DuckDB map-access syntax with explicit table qualifiers.

**Input → output:**
```
FROM logs JOIN services ON tags.service = service_name
  →
FROM logs JOIN services ON logs.tags['service'] = services.service_name
```

Handles:
- INNER JOIN and LEFT JOIN (keyword preserved)
- Reversed operand order: `ON service_name = tags.service` → `ON services.service_name = logs.tags['service']`
- Multi-word tag keys: `ON tags.called_service = service_name` → correct map key
- Case-insensitive JOIN keyword
- Whitespace tolerance
- Pass-through: no `tags.` dot-notation → unchanged

Does NOT handle:
- Subqueries in the FROM clause (translator throws a typed player-facing error if dot-notation appears inside a subquery's ON clause)
- Three-way joins (P7's UNION ALL + outer LEFT JOIN pattern avoids nested ON issues)

Unknown table context → throw typed player-facing error.

**Pipeline position — new innermost stage:**
```
translateBucket(
  translateTagFilter(
    translateTimeWindow(
      translateRate(
        translatePTF(
          translateTagJoin(sql)
        )
      )
    )
  )
)
```

`translateTagJoin` runs before `translatePTF` so each stage sees clean input.

### Files touched

| File | Change |
|---|---|
| `server/ddsql.js` | Append `translateTagJoin()` function |
| `server.js` | Add `translateTagJoin` to import + pipeline (innermost) |
| `src/main.js` | Append `'11-catalog'` to `CHAPTER_ORDER` |
| `src/reference.js` | Add Ch11 concept list (10 slugs) |
| `content/chapters/11-catalog/` | New chapter directory (all content files) |
| `content/reference/tag-join.md` | New reference doc |
| `tests/ddsql-tagjoin.test.js` | New translator unit tests (~12 tests) |
| `tests/e2e-smoke.spec.js` | Append Ch11 smoke test |
| `docs/playtest-checklist.md` | Append Ch11 section; fix Ch10 outro note |
| `scripts/generate-ch11-data.js` | Data generator |

`server/security.js`, `server/duckdb.js`, `src/puzzle.js` — no changes.

## Data shape

Three tables loaded at chapter init via `seed.sql` from `content/chapters/11-catalog/`:

### `logs` (~600 rows)
- Columns: `timestamp TIMESTAMP`, `message VARCHAR`, `tags MAP(VARCHAR, VARCHAR)`
- Tags: `service`, `level`, `env`
- Services: all Ch10 services + `log-sync-svc`
- `chrono-portal-mirror`: ~80 rows (carried forward from Ch10), all `level:error`
- `log-sync-svc`: ~40 rows, mix of `level:info` and `level:error`, timestamps in the last 30 days of the window
- Loaded from `data/logs.parquet`

### `spans` (~350 rows)
- Columns: `trace_id VARCHAR`, `timestamp TIMESTAMP`, `tags MAP(VARCHAR, VARCHAR)`, `operation VARCHAR`, `duration_ms INTEGER`, `called_service VARCHAR`
- `chrono-portal-mirror`: ~43 spans (carried forward), `called_service` values are `chrono-archive` and `chrono-ledger`
- `log-sync-svc`: ~20 spans, `called_service` values are `export-svc` and `reporting-svc` (legitimate registered services)
- Normal service spans: ~250 rows
- Loaded from `data/spans.parquet`

### `services` (12 rows, inline SQL in seed.sql)
- Identical to Ch10: `service_name VARCHAR`, `team VARCHAR`, `tier INTEGER`, `registered_at DATE`
- Does NOT include `chrono-portal-mirror` or `log-sync-svc`
- P4/P5/P6/P7 LEFT JOIN produces NULL team/tier/registered_at for both ghosts

### Ghost profiles
- **`chrono-portal-mirror`**: old, error-heavy, called founding-era systems (`chrono-archive`, `chrono-ledger`). Been running for months. Carol already knows this one from Ch10.
- **`log-sync-svc`**: recent (appeared ~29 days before chapter window end), mostly successful, calling `export-svc` and `reporting-svc`. Moving data somewhere. First appearance in Ch11.

### Generator script
`scripts/generate-ch11-data.js` — deterministic, same pattern as Ch9/Ch10 generators. Produces `data/logs.parquet` and `data/spans.parquet`. Services table is inline INSERT in `seed.sql`.

## Puzzle arc

### Puzzle 01 — JOIN intro (warm-up)

**Brief:**
> "Let me show you what a join does first. Then we'll use it."

**Query:**
```sql
SELECT timestamp, message, tags['service'] as service, team
FROM logs JOIN services ON ___
LIMIT 10
```
**Blank:** `tags.service = service_name`

**Expected result:** 10 rows with timestamp, message, service name, and team column populated.

**Success:**
> "Look at that. Every log row now has a team attached. That's what a join does — it reaches across tables and staples the context on."

**Wrong paths:**
- Plain `service = service_name` (no `tags.`) → translator error → hint: *"The service in logs is stored as a tag. The syntax is `tags.service = service_name`."*
- `tags['service'] = service_name` (map notation) → accepted as valid (translator passes through DuckDB map notation unchanged) → success
- Missing join condition entirely → DuckDB error → hint: *"The ON clause connects the two tables — try `tags.service = service_name`."*

---

### Puzzle 02 — Filter + INNER JOIN (phantom disappears)

**Brief:**
> "Good. Now the one that matters. Same join — filter to `chrono-portal-mirror`."

**Query:**
```sql
SELECT timestamp, message FROM logs
JOIN services ON tags.service = service_name
WHERE ___
LIMIT 10
```
**Blank:** `tags['service'] = 'chrono-portal-mirror'`

**Expected result:** 0 rows (success condition).

**Success:**
> "Zero rows. An inner join only returns rows that match on both sides. No match means no rows. The service exists in logs. It just doesn't exist in the catalog."

**Wrong paths:**
- Real service name → rows returned → hint: *"That service is registered. We're looking for the one that isn't."*
- `service:chrono-portal-mirror` (DDSQL tag syntax) → translateTagFilter converts it → valid, same 0-row result → success

**Note on P2 correctness:** Same as Ch10 P6 — any query filtering to an unregistered service returns 0 rows and triggers success. The educational point is the INNER JOIN exclusion behavior.

---

### Puzzle 03 — Introduce LEFT JOIN

**Brief:**
> "Inner join excludes the non-match. I need to see the non-match. Change the join type."

**Query:**
```sql
SELECT timestamp, message, service_name, team
FROM logs ___ services ON tags.service = service_name
WHERE tags['service'] = 'chrono-portal-mirror'
LIMIT 10
```
**Blank:** `LEFT JOIN`

**Expected result:** ~10 rows with NULL `service_name` and NULL `team`.

**Success:**
> "There it is. Null team. Null tier. Null registered_at. Left join doesn't exclude the non-match — it shows it to you, with nothing where the catalog data should be."

**Wrong paths:**
- `JOIN` or `INNER JOIN` → 0 rows → hint: *"Inner join excluded the phantom again. Try LEFT JOIN."*
- `RIGHT JOIN` → different result → hint: *"Right join keeps the catalog side. I want to keep the telemetry side."*

---

### Puzzle 04 — Count NULLs across all services

**Brief:**
> "Show me every service in the logs — registered or not — with their team and how many log lines they have."

**Query:**
```sql
SELECT tags['service'] as service, team, COUNT(*) as log_count
FROM logs LEFT JOIN services ON tags.service = service_name
GROUP BY ___
ORDER BY log_count DESC
```
**Blank:** `tags['service'], team`

**Expected result:** ~7 rows. All registered services show a team. Two rows (both ghosts) show NULL team.

**Success:**
> "Most have a team. Two don't.
>
> I'm going to need a minute."

**Wrong paths:**
- `service` (just alias, not the full expression) → DuckDB error → hint: *"Group by the full expression — `tags['service'], team`."*
- `tags['service']` only (missing `team`) → 0 rows or wrong shape → hint: *"Include `team` in the GROUP BY so the NULL shows up cleanly."*

---

### Puzzle 05 — Same pattern, spans table

**Brief:**
> "Same question. Different source."

**Query:**
```sql
SELECT tags['service'] as service, team, COUNT(*) as span_count
FROM spans LEFT JOIN services ON tags.service = service_name
GROUP BY tags['service'], team
ORDER BY ___
```
**Blank:** `span_count DESC`

**Expected result:** ~7 rows. Two NULL-team services visible (both ghosts appear in spans too).

**Success:**
> "Same two names. No team. No registration. One of them I knew about. The other one — that's new."

**Wrong paths:**
- `service` → DuckDB error on alias in ORDER BY → hint: *"Order by the column alias or full expression — `span_count DESC`."*
- `service DESC` → different order → hint: *"I want the most active first — order by count."*

---

### Puzzle 06 — Anti-join: isolate the unregistered

**Brief:**
> "Show me only the services that aren't in the catalog. Nothing else."

**Query:**
```sql
SELECT DISTINCT tags['service'] as service
FROM logs LEFT JOIN services ON tags.service = service_name
WHERE ___
```
**Blank:** `service_name IS NULL`

**Expected result:** 2 rows — `chrono-portal-mirror` and `log-sync-svc`.

**Success:**
> "`chrono-portal-mirror`. `log-sync-svc`.
>
> Two of them. One I've been tracking for three weeks. One I've never seen before today.
>
> `log-sync-svc` first appeared twenty-nine days ago. It's been calling `export-svc` and `reporting-svc`. It's not looking for old documents. It's moving data somewhere.
>
> I don't know where."

**Wrong paths:**
- `service_name IS NOT NULL` → registered services only → hint: *"That shows the registered ones. I want the ones without a match."*
- `team IS NULL` → same result (both NULL columns null for ghosts) → success (equivalent condition)
- Missing WHERE entirely → all services including registered → hint: *"Filter to only the services missing from the catalog."*

---

### Puzzle 07 — Boss fight: full picture

**Brief:**
> "Give me the total event count for every unregistered service, across both sources."

**Query:**
```sql
SELECT combined.service, SUM(event_count) as total_events
FROM (
  SELECT tags['service'] as service, COUNT(*) as event_count FROM logs GROUP BY service
  UNION ALL
  SELECT tags['service'] as service, COUNT(*) as event_count FROM spans GROUP BY service
) combined
LEFT JOIN services ON combined.service = service_name
WHERE ___
GROUP BY combined.service
ORDER BY total_events DESC
```
**Blank:** `service_name IS NULL`

**Expected result:** 2 rows — `chrono-portal-mirror` (~123 events), `log-sync-svc` (~61 events).

**Success:**
> "A hundred and twenty-three events for `chrono-portal-mirror`. Around sixty for `log-sync-svc`.
>
> That's not noise. That's two active services, running in our stack, that don't exist according to anyone who has the ability to say so.
>
> She's going to want to see this."

**Wrong paths:**
- `service_name IS NOT NULL` → registered services → hint: *"That's the registered services. Filter to the ones missing from the catalog."*
- Missing WHERE → all services including registered → hint: *"I only want the services without catalog entries."*

**Note on P7 complexity:** The UNION ALL subquery is provided in the template — the blank is only `service_name IS NULL`. The player is not expected to write the subquery; they're applying the anti-join pattern from P6 to a more complex source. The educational point is that the same WHERE clause works regardless of query complexity.

## Narrative beats

### Boss intro (`chapter.boss_intro`)

> "I found the second badge this morning.
>
> Same format as the first. Same redaction pen — you can tell by the pressure, the way the marker bleeds at the edges. Same empty photo slot.
>
> There are two of them now. I've got them both taped to the whiteboard.
>
> I've been sitting here for twenty minutes not running the query I already know how to run. At some point you just have to look at what's there.
>
> Let me show you what a join does first. Then we'll use it."

### P4 success — the silence

> "Most have a team. Two don't.
>
> I'm going to need a minute."

*(No further text. The pause is the beat.)*

### P6 success — naming them

> "`chrono-portal-mirror`. `log-sync-svc`.
>
> Two of them. One I've been tracking for three weeks. One I've never seen before today.
>
> `log-sync-svc` first appeared twenty-nine days ago. It's been calling `export-svc` and `reporting-svc`. It's not looking for old documents. It's moving data somewhere.
>
> I don't know where."

### P7 success — the send-off

> "A hundred and twenty-three events for `chrono-portal-mirror`. Around sixty for `log-sync-svc`.
>
> That's not noise. That's two active services, running in our stack, that don't exist according to anyone who has the ability to say so.
>
> She's going to want to see this."

### Chapter outro

> The door opens without a knock.
>
> Carol doesn't turn around. She's looking at the whiteboard: two badges, six spike windows, a printed query result with two service names highlighted.
>
> "You found something," the woman says. Not a question.
>
> Carol turns. She's seen the portraits — the founding documents, the old all-hands photos. She knows the face.
>
> "Two somethings," Carol says.
>
> M. crosses to the whiteboard. She looks at the badges for a long time. Not surprised. Not unsurprised. Something else.
>
> "One of these," she says, "I put here."
>
> She doesn't say which one.
>
> She doesn't say when.

### Auto-advance

Chapter 11 does NOT auto-advance (Ch12 not yet planned). Same pattern as Ch10 before Ch11 shipped.

## Reference drawer

**Ch11 concepts (10 slugs):** select, from, where, group-by, order-by, ddsql-tags, time-windows, rate, ptfs, tag-join

**New reference doc:** `content/reference/tag-join.md`
- What tag-based joins are (joining telemetry with catalog tables)
- Syntax: `FROM logs JOIN services ON tags.service = service_name`
- INNER JOIN vs LEFT JOIN — when each is appropriate
- Anti-join pattern: LEFT JOIN + WHERE col IS NULL
- Dot-notation shorthand: `tags.<key>` maps to DuckDB `tags['<key>']`

## Testing

### Translator unit tests (`tests/ddsql-tagjoin.test.js`, ~12 tests)

1. Basic INNER JOIN: `FROM logs JOIN services ON tags.service = service_name` → correct DuckDB with table qualifiers
2. LEFT JOIN: same rewrite, `LEFT JOIN` preserved
3. Reversed operand order: `ON service_name = tags.service` → symmetric output
4. Multi-word key: `ON tags.called_service = service_name` → correct map key
5. With WHERE clause: translator only touches ON clause, WHERE unchanged
6. Pass-through: no `tags.` dot-notation → input unchanged
7. Full query round-trip: SELECT + FROM + JOIN + WHERE + GROUP BY + LIMIT
8. LEFT JOIN with IS NULL in WHERE — anti-join pattern passes through untouched
9. Whitespace tolerance: `ON  tags.service  =  service_name` → correct output
10. Case-insensitive: `left join` and `LEFT JOIN` both rewrite correctly
11. Composition: output fed through `translateTagFilter` — no double-transform
12. Unknown dot-notation (not `tags.`) passes through unchanged

### E2E smoke test (appended to `tests/e2e-smoke.spec.js`)

- Plant Ch11 state in localStorage (Ch1–10 completed)
- Check 2 bubbles: boss intro + P1 brief
- Brief contains "join"
- Fill typed input: `tags.service = service_name`
- Run → expect success bubble

### Playtest checklist additions

New Ch11 section covering:
- All 7 puzzles: correct path + at least one wrong path each
- P2 note: INNER JOIN returns 0 rows (same success pattern as Ch10 P6)
- P7 note: UNION ALL provided in template — blank is only the WHERE clause
- Reference drawer: 10 concepts visible, tag-join entry renders without error
- Ch10 outro note updated: "auto-advances to Chapter 11"

### Content validator

Existing `npm run validate-content` exercises each puzzle's canonical query through the full translator + DuckDB pipeline.
