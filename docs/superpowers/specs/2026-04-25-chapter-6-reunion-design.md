---
title: Chapter 6 — "The Reunion" — Design
date: 2026-04-25
status: draft
phase: Phase 1, Chapter 6 of 6 (season finale)
---

# Chapter 6 — "The Reunion" — Design

## Summary

Sixth and final chapter of Phase 1. Concepts: `INNER JOIN`, table aliases, 2- and 3-table joins. Mechanic: typing (continued from Chapter 5). Setting: Chrono Consulting HQ — first chapter without time travel. The player JOINs across the firm's own master ledger (`chrono_clients`, `chrono_engagements`, `era_records`) to surface Hemiunu's appearances across all five prior chapters and, in the final puzzle, reveal that the fifth Hemiunu engagement is at Chrono Consulting itself. The case closes. The chapter outro flags Phase 2 (DDSQL): Chrono's own observability system has just gone dark.

## Goals

- Teach `INNER JOIN`, table aliases, and 2- and 3-table joins through one investigation that uses each concept exactly once before combining them.
- Pay off the season arc — the player runs the query that proves Hemiunu's five-era pattern with their own hands.
- Land the Phase 2 hook gracefully so it feels like a continuation, not a stop.
- Reuse the typing mechanic and the existing engine end-to-end. No new mechanic mode, no engine changes.

## Non-goals

- `LEFT JOIN`, `RIGHT JOIN`, `OUTER JOIN`, `FULL JOIN`, or `CROSS JOIN` (Phase 1.5 territory).
- Comma-separated FROM with WHERE conditions (older join syntax — out of scope; we teach explicit `INNER JOIN ... ON ...` only).
- Subqueries, CTEs, window functions (Phase 1.5).
- Re-querying prior chapters' actual seed tables. The data the player JOINs is *summary records* maintained by the firm, not the original ledgers from chapters 2–5.

## Mechanic — typing (no engine changes)

Chapter 6 uses `mechanic_mode: "typing"` introduced in Chapter 5. No new code: the typed-blank renderer, the SQL assembler, the hint system, the security validator, and the row comparator all handle JOINs unchanged.

The security validator's allowlist is `SELECT` / `WITH` and the blocklist is filesystem functions. `INNER JOIN` is part of `SELECT` syntax — no validator update.

## Data — three-table master ledger

All three tables hand-authored. ~75 rows total.

### `chrono_clients` (~15 rows)

```sql
CREATE TABLE chrono_clients (
  client_id      INT PRIMARY KEY,
  name           TEXT NOT NULL,
  home_era       TEXT,
  status         TEXT  -- 'active' | 'archived' | 'flagged'
);
```

Includes:
- **Hemiunu** (`client_id` somewhere mid-table, `home_era='Old Kingdom Egypt'`, `status='flagged'`)
- The historical figures the player has met: **Pharaoh Menkaure** (Old Kingdom Egypt), **Gladys Vance** (1920s Chicago), **Cornelius Grayson** (1890 New York), **Oldrich** (1347 Prague), **Carol** (Chrono HQ, status='active')
- ~10 decoy clients across various eras: a Roman senator, a Sumerian scribe, a Han dynasty official, a Tudor steward, a Renaissance banker, etc. Mostly `status='active'` or `'archived'`. One or two `'flagged'` for puzzle 04 noise.

### `chrono_engagements` (~30 rows)

```sql
CREATE TABLE chrono_engagements (
  engagement_id  INT PRIMARY KEY,
  client_id      INT NOT NULL,         -- FK -> chrono_clients
  era            TEXT NOT NULL,
  year           INT NOT NULL,         -- absolute year (BCE = negative)
  anomaly_note   TEXT                  -- NULL for normal cases
);
```

Distribution:
- 5 are Hemiunu's — one per prior chapter's anomaly + one at Chrono HQ. All have `anomaly_note` populated.
- 4 more anomalies are decoys (other flagged clients with different era/year context). Populated `anomaly_note`.
- ~21 normal engagements: routine consulting work for the various clients across eras. `anomaly_note IS NULL`.

### `era_records` (~30 rows, 1:1 with engagements)

```sql
CREATE TABLE era_records (
  record_id      INT PRIMARY KEY,
  engagement_id  INT NOT NULL,         -- FK -> chrono_engagements
  detail         TEXT NOT NULL,
  location       TEXT,
  payment        TEXT
);
```

Hemiunu's 5 era_records are the chapter's narrative payoff. They reach back into the prior chapters' specifics:

| era | year | detail | location | payment |
|---|---|---|---|---|
| Old Kingdom Egypt | -2519 | "Overseer's mark on small grain delivery — 420 units, year 9 of Menkaure" | Saqqara | old coin |
| 1347 Prague | 1347 | "Tavern patron, 52 weekly Wednesday visits, never aged" | Mala Strana | old coin |
| 1890 New York | 1890 | "Census entry id 3000 — no borough, no occupation recorded" | unknown | none |
| 1927 Chicago | 1927 | "Speakeasy patron, March 14, $34 tab, name initially illegible" | Hemlock Room | unmarked bills |
| Chrono HQ | 2026 | "Unauthorized access to time-portal infrastructure" | (internal) | — |

The fifth row is the kicker — the call is coming from inside the building. It only appears in the player's result set when they run the final query. Carol's success copy lands the realization.

### Other anomalies (decoys for puzzle 04)

A handful of unrelated flagged engagements so puzzle 04 (`WHERE anomaly_note IS NOT NULL`) returns ~9 rows total, not just Hemiunu's 5. Examples:
- A Roman senator who paid in counterfeit denarii
- A Sumerian scribe with year-on-year tablet inconsistencies
- A Tudor steward with missing inventory
- A 19th-century railroad scout flagged for a temporal-displacement claim that didn't pan out

The decoys never share Hemiunu's name, so puzzle 06's `WHERE c.name = 'Hemiunu'` filters them out cleanly.

## Puzzle arc

Each puzzle introduces or reinforces exactly one new thing. The finale (06) combines them.

| # | Concept | Player query (rough shape) | Reveals |
|---|---|---|---|
| 01 | `SELECT` refresher | `SELECT * FROM chrono_engagements LIMIT 10` | The master ledger exists. Player meets the schema. Sees `client_id` and wonders who these are. |
| 02 | First `INNER JOIN` | `SELECT chrono_engagements.era, chrono_engagements.year, chrono_clients.name FROM chrono_engagements INNER JOIN chrono_clients ON chrono_engagements.client_id = chrono_clients.client_id LIMIT 10` | Names attach to engagements. Verbose. |
| 03 | Table aliases | Same join with `e` and `c` aliases. Same result, half the typing. | The aliasing convention. |
| 04 | JOIN + `WHERE` | Filter joined result to anomalies (`WHERE e.anomaly_note IS NOT NULL`) | ~9 flagged engagements across various names. Hemiunu is in there 5 times. |
| 05 | 3-table JOIN | Add `era_records` for the per-engagement detail | Same 9 anomalies, now with location and payment. |
| 06 | **The reveal** | `WHERE c.name = 'Hemiunu' ORDER BY e.year` | Exactly 5 rows, in chronological order, last entry is Chrono HQ 2026. |

The finale's expected SQL:

```sql
SELECT e.era, e.year, r.detail, r.location, r.payment
FROM chrono_engagements e
INNER JOIN chrono_clients c ON e.client_id = c.client_id
INNER JOIN era_records r ON r.engagement_id = e.engagement_id
WHERE c.name = 'Hemiunu'
ORDER BY e.year
```

5 rows. Same name. Five eras spanning 4500 years. The fifth is now.

## Narrative — first draft

Tone: Carol drier than ever — the dread is in the data, not the dialogue. She's already pulled every ledger and put them on the desk. The investigation is detective work without time travel, and she's the only voice in the room.

### Cold open (Carol)

> Carol is at the desk when you walk in. The desk is covered in ledgers. Five of them. Old Kingdom, Prague, New York, Chicago, and one binder you don't recognize.
>
> "I had records pull everything. Every chapter we've worked, every engagement we've billed for. The firm has been around longer than I have. The ledgers don't always agree."
>
> She doesn't sit down. "I want to put them in the same shape. Then I want to see who's in all of them. Try not to flinch."
>
> The mechanic on the desk is the same as Oldrich's. Type the queries. The firm doesn't do forms with neat little boxes for its own books either.

### Per-puzzle dialogue

**Puzzle 01 — "What we have"**
- *brief*: Carol: "Start with our engagement ledger. I want to see the first ten rows. Just so we know what we're looking at."
- *success*: "Right. Era, year, client_id. That id refers to a name on the client roster, but you have to ask the roster for it."

**Puzzle 02 — "Attach the names"**
- *brief*: Carol: "Join the engagements to our client roster on `client_id`. I want a name next to every engagement, not a number. Use INNER JOIN — the table I want is `chrono_clients`, the column to match is `client_id` on both sides."
- *success*: "Good. We can read it now."

**Puzzle 03 — "Less typing"**
- *brief*: Carol: "Same query. But name the engagements table `e` and the clients table `c`. Use those aliases everywhere else. SQL was designed by people who hated typing."
- *success*: "Better. You'll do this a lot. Get comfortable with it."

**Puzzle 04 — "The flagged ones"**
- *brief*: Carol: "Now show me only the engagements someone flagged. The `anomaly_note` column is `NULL` for normal cases. Filter it out. Keep the join."
- *success*: Carol pulls a chair over. She runs her finger down the names column. "Nine entries. Five — that's the same name. Five different rows, same name." She lets it sit.

**Puzzle 05 — "Get the details"**
- *brief*: Carol: "Add the third table — `era_records`. Each engagement has one. The detail column is what someone wrote down at the time. Join on `engagement_id`."
- *success*: Carol slides her finger across the new columns. "Saqqara. Mala Strana. The Hemlock Room. Census three thousand." She pauses on a fifth detail. "Internal." She doesn't comment further. "Pull just his rows next, oldest first."

**Puzzle 06 — "The reunion"**
- *brief*: Carol: "Filter to just Hemiunu — that name in the clients table. Order by year. Oldest first. I want the whole story end to end."
- *success*: Carol reads down the list. Two and a half thousand BCE. 1347. 1890. 1927.
  > And then she stops.
  >
  > "Twenty twenty-six. Chrono HQ." She doesn't read the rest aloud. "We're not chasing him through history. He's been in our basement the entire time."

### Outro / Phase 2 stinger

> Carol picks up the phone. The line rings once and clicks dead. She tries another. Same.
>
> "Telecom's down too." She looks at the clock. "Internet — I had three dashboards open this morning. They're all blank."
>
> She puts the phone back in its cradle, gentle. "He cut the observability before he left. We can't see the building from inside the building."
>
> A long beat. She walks over to the window — and pulls the blinds.
>
> "Get yourself a coffee. The CEO's flying back. When she lands, she's going to want someone in this room who can read a query. That's you now."
>
> Then, quieter, almost to herself:
>
> "Welcome to Phase Two."

## Engine changes

**None.** The typed-blank renderer (added in Ch 5), the SQL assembler, the hint system, the security validator, and the row comparator all handle this chapter's queries without modification.

## Wiring (one-line changes only)

1. **`src/main.js`** — append `'06-reunion'` to `CHAPTER_ORDER`.
2. **`src/reference.js`** — add `'06-reunion'` entry to `CONCEPTS_FOR_CHAPTER`. Concepts list is the Chapter 5 set + `inner-join` + `table-aliases`.
3. **No new speaker** — Carol is already in `SPEAKERS`.

## Reference markdown — two new files

- `content/reference/inner-join.md` — explains `INNER JOIN ... ON ...` syntax, the row-matching mental model, why "inner" means "rows that match on both sides", brief 1- and 2-line examples.
- `content/reference/table-aliases.md` — explains the `t1 a INNER JOIN t2 b ON a.x = b.x` pattern, why aliases reduce ambiguity, brief examples.

Both follow the existing reference style (concept + form + notes).

## Testing

- **Content validator** runs each puzzle's `expected.sql` against the chapter seed. Auto-catches typos, schema drift, and expected-row-count mismatches.
- **Engine unit tests** — none new needed. `assembleSql` already handles multi-line typed values and comma-separated SELECT lists.
- **Playwright smoke** — extend `tests/e2e-smoke.spec.js` with a Chapter 6 Puzzle 01 walkthrough (mirrors the Chapter 5 pattern).
- **Manual playtest checklist** — append a Chapter 6 section to `docs/playtest-checklist.md` covering boot/nav, the JOIN puzzle correctness, the reference drawer entries for `inner-join` and `table-aliases`, the per-puzzle wrong-path hints, browser compat, and the Phase 2 stinger rendering.

## Dependencies / prereqs

- No new npm packages. No security validator changes. No engine changes.
- New reference markdown: `content/reference/inner-join.md`, `content/reference/table-aliases.md`.

## Open questions / things to confirm in the implementation plan

- Hemiunu's `client_id` value — pick something unmemorable (not 1, not 7, not 30 since that's his Chapter 5 patron_id from `presequel`). Final pick lives in the seed.
- Whether the seed.sql is hand-authored as a single file (preferred for ~75 rows) or generated by a script. Default: hand-authored — this isn't 500 rows of visits, it's a small ledger.
- Exact wording of decoy `anomaly_note` text — should evoke real consulting noise without distracting from the Hemiunu reveal.
