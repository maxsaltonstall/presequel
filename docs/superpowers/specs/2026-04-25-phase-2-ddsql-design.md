---
title: Phase 2 (DDSQL) — Season Design
date: 2026-04-25
status: draft
phase: Phase 2 (Chapters 7–11)
---

# Phase 2 (DDSQL) — Season Design

## Summary

Five-chapter sequel arc to Phase 1. The player shifts from era-hopping consulting analyst to internal SRE-adjacent investigator. Chrono Consulting's own observability went dark at the close of Phase 1; Phase 2 unfolds across that broken stack. Concepts: tag-based selection, time windows, time-series math, polymorphic table functions (PTFs), and tag-driven joins. Mechanic stays typing throughout.

The season is the elaboration of the 30-line Phase 2 sketch that lives in `2026-04-21-sql-learning-game-design.md`. This document scopes the arc; per-chapter specs follow.

## Goals

- Teach the five DDSQL concept areas through one continuous investigation that climaxes in chapter 11.
- Reuse the typing mechanic and the existing `/run` server, security validator, DuckDB engine. Add a new server-side **DDSQL→DuckDB translator** that grows incrementally chapter by chapter.
- Land the season-level reveal — there was a second saboteur, the CEO is finally on-page, the firm's history is older than anyone alive.
- Set up Phase 1.5 (subqueries, CTEs, window functions, OUTER JOIN, CASE) as the next natural step. Don't box it in.

## Non-goals

- A real Datadog backend. We simulate DDSQL by translating to DuckDB. Players write authentic-looking DDSQL; the engine fakes the rest.
- A full DDSQL implementation. The translator covers exactly what the curriculum needs and nothing else.
- Phase 1.5 concepts (subqueries, CTEs, window functions, OUTER JOIN, CASE). Phase 2 stays disciplined within the five concept areas above.
- Time travel as a mechanic. Phase 2 stays at HQ.

## Chapter map

Five chapters, one concept area per chapter. The mechanic is typing throughout (no new mechanic mode).

| Ch | Title (working) | Concept area | Plot beat in the slow-burn arc |
|---|---|---|---|
| 7 | "Static" | Tag-based selection | Player investigates recent log spikes. Surfaces logs tagged `service:chrono-portal-mirror` — a service Carol doesn't recognize. First sighting of the phantom. |
| 8 | "When" | Time windows (`@timestamp:[now-1h to now]`, bucketing) | Player narrows down *when* the anomalies happen. Discovers the spikes cluster around specific UTC instants — a coordination pattern starts to show. |
| 9 | "Heat" | Time-series math (rates, deltas, moving averages) | Player uses rates to surface the phantom's traffic bursts against normal background. The mirror service has signatures that don't fit normal infrastructure load. |
| 10 | "Reach" | PTFs — `logs(...)`, `spans(...)`, `metrics(...)` | Player queries spans and host metrics, sees `chrono-portal-mirror` *everywhere* it shouldn't be — as a peer in spans, as a workload in metrics, as a source in logs. Never in the catalog. |
| 11 | "The Catalog" (season finale) | Tag/resource joins | Player JOINs the service catalog with the three telemetry sources. The phantom is in every telemetry source but missing from the catalog. The CEO arrives. Hemiunu had a partner. The firm has a co-founder it stopped talking about. |

Working titles only — chapter specs may rename.

## Narrative spine

Phase 1's structural rhythm was *episodic with a slow-burn pattern* — each chapter solved a self-contained problem while a name (Hemiunu) accumulated across the data. Phase 2 reuses that rhythm:

- **Episodic layer** — each chapter is its own outage / anomaly / investigation, complete in one sitting.
- **Slow-burn layer** — a recurring trace the player notices over time. The Ch 11 join is the moment the data confesses what's been happening.

The recurring trace is a **phantom service name** — working name `chrono-portal-mirror`. It appears in logs, spans, metrics, and host telemetry across the season. It is not in the firm's official service catalog. An SRE who knows what they're looking at would clock it the moment they saw it twice; the player learns to clock it the way Carol clocked Hemiunu in Phase 1.

**Stretch — timestamp coincidence as secondary pattern.** Anomalies across chapters cluster at the same UTC instants (down to the second). The player who looks closely sees the coordination. Stretch goal: bake this into the data even if no chapter's expected query forces the player to notice. A reward for the attentive player.

### The CEO

Felt presence from Ch 7, full arrival in Ch 11. Indirect signals across the season:
- A redacted email Carol forwards in Ch 7's cold open
- A voicemail Carol replays in Ch 9's stinger ("She's about three hours out.")
- A security badge with no photo, taped to the desk in Ch 10
- The walk-in in Ch 11 — first time the player sees her face. Same beat as Hemiunu in Ch 5: felt for chapters, seen at the moment the case turns.

Her arc reveals that the firm has a co-founder who's been edited out of the official record. That co-founder built `chrono-portal-mirror` decades or centuries ago. That co-founder worked with Hemiunu. The mystery's outer edge.

### Tone shift

Phase 1: workplace comedy + era flavor + dread. Phase 2: workplace comedy + SRE flavor + dread. Carol's voice carries — dry, tired, weirdly protective. The CEO is the new tonal element.

## Architecture — DDSQL→DuckDB translator

The technical heart of Phase 2. Lives at `server/ddsql.js` (alongside `server/security.js`) and runs server-side, before the security validator + DuckDB pipeline. Grows incrementally — each chapter ships with the translator stage(s) it needs.

### Stage progression

| Stage | Introduced in | Translates |
|---|---|---|
| `tagFilter` | Ch 7 | `WHERE env:prod AND status:error` → `WHERE tags['env'] = 'prod' AND tags['status'] = 'error'` |
| `timeWindow` | Ch 8 | `@timestamp:[now-1h to now]` → `WHERE timestamp >= NOW() - INTERVAL '1 hour' AND timestamp <= NOW()` (and similar bucketing helpers) |
| `tsMath` | Ch 9 | `rate(error_count by service)` → CTE pattern with `LAG()` window function (or precomputed rate columns in the parquet, see "Open question" below) |
| `ptf` | Ch 10 | `logs(...)`, `spans(...)`, `metrics(...)` → `SELECT ... FROM logs WHERE ...` (and `spans`, `metrics`, etc.) — backed by tables pre-loaded from parquet at chapter init via `seed.sql`. The function args become WHERE clauses. The translator never emits `read_parquet`, so the security validator's filesystem blocklist is preserved unchanged. |
| `tagJoin` | Ch 11 | DDSQL's tag-keyed joins → DuckDB JOINs on tag-derived columns |

### Pipeline

```
player input → DDSQL translator (stages, in order) → security validator → DuckDB
```

Each stage is a pure function `(string) → string` that recognizes its target syntax and emits DuckDB. Stages compose (output of `tagFilter` feeds `timeWindow`, etc.). Stages that don't recognize their syntax in the input pass through untouched.

### Test contract per stage

Each stage gets a `tests/ddsql-<stage>.test.js` file with input/output pairs covering happy paths, edge cases, and "this isn't my syntax" pass-through cases. Mirrors the existing `tests/sql-assembly.test.js` shape.

### Error semantics

When DDSQL syntax is malformed (unmatched bracket, unknown PTF), the translator throws a typed error with a player-facing message that *sounds like DDSQL*, not DuckDB. The hint system surfaces these via the existing `when: error` path. Players experience "real" DDSQL errors.

## Data — pre-generated parquet for everything

Per-chapter parquet files committed to the repo, generated once by per-chapter scripts. Loaded at chapter init via `read_parquet('${CONTENT_ROOT}/...')` in `seed.sql`.

### Why parquet, not CSV or inline INSERT

- Parquet is the closest authoring format to what DDSQL queries under the hood (tag-indexed columnar telemetry).
- DuckDB's parquet support is excellent — fast load, native types, good with large datasets.
- Inline INSERT works for small lookup tables, but Phase 2 has telemetry — log lines, metric series, spans. Inline INSERT becomes painful at thousands of rows.
- A generator script per chapter keeps the data deterministic and reproducible from code, while the parquet output is what gets loaded.

### File layout

```
content/chapters/07-static/
  seed.sql                  -- CREATE TABLE … FROM read_parquet(...) calls
  data/
    logs.parquet            -- the chapter's main telemetry source
    services.parquet        -- the official service catalog (small lookup)
    [chapter-specific]
  scripts/
    generate-data.js        -- run once to (re)generate the parquet files
```

(Same shape for chapters 8–11, with chapter-appropriate parquet contents.)

### Sizes

Estimated total binary in the repo across all 5 chapters: a few MB. Manageable. Each chapter's parquet is regenerable from its script if anyone needs to inspect or audit.

## Engine changes summary

| Component | Change |
|---|---|
| `server/ddsql.js` (new) | Translator. Grows per chapter as stages are added. |
| `server.js` | One-line change: pipe player input through the translator before the security validator. |
| `server/security.js` | No change — translator output is plain DuckDB SELECT, which the existing validator already handles. |
| `server/duckdb.js` | No change. |
| `src/puzzle.js` | No change — typed-blank renderer and assembleSql work for any text. |
| `src/main.js` | Append `'07-static'`, `'08-when'`, `'09-heat'`, `'10-reach'`, `'11-catalog'` to `CHAPTER_ORDER` as each chapter ships. |
| `src/reference.js` | Add per-chapter concepts and reference markdown for DDSQL-specific concepts. |

## Reference markdown additions

Phase 2 introduces concepts that need their own reference docs:
- `content/reference/ddsql-tags.md` — tag-syntax shorthand
- `content/reference/time-windows.md` — `@timestamp:[...]` and bucketing
- `content/reference/time-series-math.md` — `rate()`, `delta()`, moving averages
- `content/reference/ptfs.md` — `logs()`, `spans()`, `metrics()`, `rum()`
- `content/reference/tag-joins.md` — joining via tag dimensions

Existing Phase 1 reference docs carry forward into Phase 2 chapters' `CONCEPTS_FOR_CHAPTER` entries.

## Testing strategy

Same shape as Phase 1, plus translator-specific tests:

| What | How |
|---|---|
| Translator unit tests | `tests/ddsql-<stage>.test.js` — input/output pairs per stage |
| Content validator | Existing `npm run validate-content` — runs each puzzle's expected DDSQL through the translator + DuckDB |
| Engine unit tests | Existing patterns carry over |
| Playwright smoke | One typed-puzzle walkthrough per chapter (matches Phase 1 pattern) |
| Manual playtest | Per-chapter sections in `docs/playtest-checklist.md` |

## Decomposition

Each chapter gets its own brainstorm-spec-plan-execute cycle. Specs land at:

- `docs/superpowers/specs/<date>-chapter-7-static-design.md`
- `docs/superpowers/specs/<date>-chapter-8-when-design.md`
- `docs/superpowers/specs/<date>-chapter-9-heat-design.md`
- `docs/superpowers/specs/<date>-chapter-10-reach-design.md`
- `docs/superpowers/specs/<date>-chapter-11-catalog-design.md`

Each chapter spec covers: per-chapter narrative beats (cold open, per-puzzle dialogue, stinger), data shape (parquet contents and how they're generated), the puzzle arc, the translator stages introduced, and any per-chapter testing notes.

The first per-chapter brainstorm — Chapter 7 — follows immediately after this season spec is approved.

## Open questions / things to confirm in chapter specs

- **Phantom service name.** Working name `chrono-portal-mirror`. Final pick lives in Chapter 7's spec; subsequent chapters inherit it.
- **CEO name and voice.** Working profile: she's senior, feels older than the firm should allow, knows things she shouldn't be old enough to know. Final voice and dialogue land in Chapter 11's spec; earlier chapters seed her presence indirectly.
- **`tsMath` translator: window function vs precomputed rate columns.** Whether `rate()` translates to a DuckDB CTE using `LAG()` (real time-series math, harder translator), or whether the parquet ships with pre-rate'd columns and the translator just selects them (simpler, slightly less authentic). Decide in Chapter 9's spec.
- **PTF translator surface.** Which PTFs ship in Ch 10 — `logs`, `spans`, `metrics`, `rum`, or only a subset? Decide based on what the chapter's investigation actually needs.
- **Timestamp coincidence — required or stretch?** Whether the season-finale query *forces* the player to notice the timestamp clustering, or whether it's only a reward for the curious. Default: stretch goal, only data-baked, never plot-required.
- **CEO arrival staging.** Whether her in-person walk-in opens or closes the Ch 11 finale puzzles. Decide in Chapter 11's spec.

## Why this season design supports Phase 1.5

- **DDSQL translator is additive** — Phase 1.5 concepts (subqueries, CTEs, window functions, OUTER JOIN, CASE) are pure DuckDB and don't need the translator. Phase 2's engine work doesn't constrain Phase 1.5.
- **Content-as-data engine** — adding more chapters is content + a chapter directory, same as Phase 1 was. The engine doesn't care.
- **Curriculum continuity** — a Phase 2 player ends with strong DDSQL fundamentals; Phase 1.5 picks up where they need real SQL power tools (CTEs, windows). Natural arc.
