---
title: SQL Learning Game — Design
date: 2026-04-21
status: approved
phase: Phase 1 (SQL fundamentals) specced in detail; Phase 2 (DDSQL) sketched only
---

# SQL Learning Game — Design

## Summary

A browser-based single-player learning game that teaches SQL from zero to "can write useful queries" through fill-in-the-blank puzzles set inside a comedic time-travel narrative. Phase 1 covers core SQL (SELECT through basic JOINs and aggregates) across 6 chapters, ~36 puzzles. Phase 2 (DDSQL) is scoped separately after Phase 1 ships.

### Goals

- Take a learner with CS fundamentals but zero SQL knowledge to comfort with reading, modifying, and writing real SQL queries.
- Keep the experience fun and funny — a learner should finish sessions *wanting* to play more, not pushing through.
- Use real datasets where they teach better than fabricated ones.
- Set up a clean on-ramp to DDSQL as a Phase 2 extension.

### Non-goals (explicit for Phase 1)

- Accounts, cloud sync, leaderboards, social features.
- On-demand hint buttons or tiered hint systems (hints surface only on submission).
- Free-play query sandbox outside of puzzles.
- Mobile-native apps (responsive web only).
- Internationalization (English only for v1).
- Accessibility automation (manual pass only; keyboard nav and screen-reader review done by hand).
- Specifying Phase 2 puzzles or chapter contents in detail.

## Narrative concept

**Chrono Consulting, Inc.** The player is a junior data analyst at a time-spanning consulting firm. Each chapter is a new client engagement in a different era — a Pharaoh's grain audit, a 1920s speakeasy ledger, a Victorian census, a medieval tavern keeper's customer list. The player's boss is Carol, a wry ever-suffering Ops Director who covers the Eisenhower-era desk and above. Clients are historical figures with anachronistic data problems.

A season arc runs under the episodic structure: a name — Hemiunu — appears in ledgers across centuries where it shouldn't. By Chapter 6, the player has the JOIN skill needed to prove the connection across eras and close the case. The finale flags Phase 2 (DDSQL): Chrono Consulting's own observability system has gone dark and needs investigating.

Tone: workplace comedy (corporate absurdity — expense reports for time-machine fuel, mandatory HR training on not stepping on butterflies) crossed with era-clash absurdity (a Roman client demanding a Tableau dashboard). Humor as garnish, not the main course; the game is a learning tool first.

## Architecture

### Stack

- **Frontend:** vanilla JS, ES modules in the browser, no build step, no framework.
- **Backend:** single Node script (~150 lines) serving both static files and one `POST /run` endpoint.
- **Database:** DuckDB (via `@duckdb/node-api`), embedded, in-memory per chapter.
- **Persistence:** localStorage only for player save state.

### Process model

One Node process, one port. `node server.js` starts both the static file server and the query endpoint. No separate web server, no nginx, no build pipeline.

### Directory layout

```
sqllearning/
├── server.js              # ~150 lines: static files + POST /run
├── package.json           # deps: @duckdb/node-api only
├── index.html             # shell page
├── src/
│   ├── main.js            # init, routing, game loop
│   ├── state.js           # global game state + localStorage save
│   ├── puzzle.js          # puzzle renderer (dropdowns/word bank/typing)
│   ├── dialogue.js        # chat-bubble renderer for NPCs and boss
│   ├── reference.js       # reference drawer
│   ├── results.js         # results table renderer
│   └── api.js             # fetch wrapper for /run
├── content/
│   ├── chapters/
│   │   ├── 01-onboarding/
│   │   │   ├── chapter.json      # metadata, client, era, arc hooks
│   │   │   ├── seed.sql          # CREATE TABLE + INSERT for this chapter
│   │   │   └── puzzles/
│   │   │       ├── 01.json
│   │   │       ├── 02.json
│   │   │       └── ...
│   │   ├── 02-pharaoh/
│   │   └── ... (6 chapters)
│   ├── reference/
│   │   ├── select.md
│   │   ├── where.md
│   │   └── ...
│   └── data/                      # real datasets for later chapters
│       ├── chicago-crime.parquet
│       └── ...
├── style.css
└── .gitignore
```

### Request flow

1. Page loads; `main.js` boots.
2. State restored from localStorage; current chapter + puzzle derived.
3. `chapter.json` and the current `puzzle.json` fetched and rendered (dialogue bubble, puzzle, reference drawer).
4. Player fills blanks; clicks "Run query."
5. Client POSTs `{ chapter, sql }` to `/run`.
6. Server lazy-initializes a DuckDB in-memory connection for that chapter if not already open, executes the player's SQL, returns `{ rows, columns }` or `{ error }`.
7. Client compares result rows to the memoized expected rows (obtained by running `expected.sql` once per puzzle load).
8. Client dispatches to success or failure flow.

### Key simplifications

- **One DuckDB connection per chapter,** held for the session, reset on chapter change. No per-puzzle teardown.
- **Static files served by the same Node script** as `/run`. No Express; Node's `http` module is sufficient.
- **No build step.** ES modules imported directly by the browser.

## Content model

Content lives as data in `content/`, not in code. The engine is content-agnostic.

### `chapter.json`

```json
{
  "id": "02-pharaoh",
  "ordinal": 2,
  "title": "The Pharaoh's Grain Audit",
  "era": "Old Kingdom Egypt, c. 2530 BCE",
  "client": {
    "name": "Pharaoh Menkaure",
    "portrait": "pharaoh.svg",
    "voice": "formal, suspicious, slightly paranoid"
  },
  "boss_intro": "Carol from the Eisenhower desk covers the Old Kingdom now...",
  "concepts_introduced": ["where", "comparison_operators"],
  "concepts_reviewed": ["select", "from"],
  "mechanic_mode": "dropdown",
  "arc_hook": "A granary record from year 9 is missing. Not deleted — absent.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "You send Menkaure his report. Carol notices a timestamp anomaly..."
}
```

### `puzzles/NN.json`

```json
{
  "id": "03",
  "concept": "where",
  "brief": {
    "speaker": "pharaoh",
    "text": "Show me only the granary entries from year 9 of my reign onward."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "name, amount" },
    { "type": "keyword", "text": "FROM" },
    { "type": "blank",   "id": "table",  "mode": "dropdown",
      "options": ["granary", "pharaohs", "pyramids"] },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "column", "mode": "dropdown",
      "options": ["year", "name", "amount"] },
    { "type": "blank",   "id": "op",     "mode": "dropdown",
      "options": [">=", "=", "<"] },
    { "type": "blank",   "id": "value",  "mode": "dropdown",
      "options": ["9", "10", "1"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT name, amount FROM granary WHERE year >= 9",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high",
      "text": "Too many entries. The Pharaoh only cares about year 9 onward." },
    { "when": "wrong_count_low",
      "text": "Not enough. Did you forget to include year 9 itself?" },
    { "when": "error",
      "text": "The scribes can't read this. Check your syntax." },
    { "when": "default",
      "text": "Something's off. Imhotep was in the year-9 batch — is he in your results?" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "Yes. Exactly what I suspected. Hemiunu's name appears where it should not."
  }
}
```

### `seed.sql`

Chapter tables, fully human-readable:

```sql
CREATE TABLE granary (
  name     VARCHAR,
  year     INTEGER,
  amount   INTEGER
);

INSERT INTO granary VALUES
  ('Imhotep',  9,  2400),
  ('Hemiunu',  9,  1800),
  ('Rahotep',  7,  1200);
```

Later chapters replace `INSERT` with `COPY granary FROM 'content/data/whatever.parquet'` when drawing on re-skinned real datasets.

### `reference/NN-concept.md`

Concept reference entries surfaced in the always-available drawer:

```markdown
---
concept: where
title: WHERE
introduced_in: 02-pharaoh
---

# WHERE

Filters which rows a query returns. Goes after `FROM`.

## Syntax
SELECT columns FROM table WHERE condition

## Example
SELECT name FROM pets WHERE age > 5
```

### Design rationale

- **`template` as typed-token array** — rendering stays declarative; `puzzle.js` maps tokens to DOM elements. Swapping mechanic mode (dropdown / word bank / typing) is a renderer change, not a content change.
- **`hints` pattern-matched on failure signal** — in-character nudges tied to specific failure modes. `default` is the fallback.
- **`expected.sql` as the reference answer** — validation runs *both* the player's SQL and this one, then compares row sets. This accepts any correct query, not just literal blank-matches — critical for typing mode where players may phrase things differently.
- **Seed files as `.sql`** — data is diff-readable, versionable, and DuckDB-native.

## Gameplay loop

### Puzzle state machine

```
idle → composing → running → { success | failed } → composing | next_puzzle
```

- **idle:** puzzle JSON just loaded; dialogue bubble renders the brief; blanks empty; "Run query" disabled.
- **composing:** player filling blanks. "Run query" enabled once all blanks are filled (or for typing mode, once the textarea is non-empty).
- **running:** POST in flight; subtle pending indicator; other controls locked.
- **success:** row-set matches expected; success dialogue renders; "Next puzzle" button appears; state saves.
- **failed:** error or result mismatch. Appropriate hint surfaces as a new dialogue bubble. Blanks stay as-is — player edits, doesn't restart. Attempt count increments.

### Mechanic modes (progressive)

Chapters transition the renderer as the player gains skill. Same puzzle JSON, different UI.

| Chapters | Mode | Player action | Skill exercised |
|---|---|---|---|
| 1–2 | `dropdown` | Each blank is a `<select>` with its own `options` | Recognition — learning syntax shape |
| 3–4 | `word_bank` | Blanks are empty slots; all options pooled + shuffled + distractors; click token → fills first empty slot, click filled slot → returns to bank | Synthesis — matching tokens to positions |
| 5–6 | `typing` | Blanks are `<input>`s (or whole query is `<textarea>`) | Recall — producing syntax from memory |

### Assembling SQL

- `dropdown` / `word_bank`: concatenate tokens (keywords, fixed text, filled blanks) with spaces.
- `typing`: read the textarea contents directly.

### Validation

Server endpoint is intentionally dumb — just runs SQL.

```
POST /run
body: { chapter: "02-pharaoh", sql: "..." }

response:
  { rows: [[...], ...], columns: ["name", "amount"] }      // success
  { error: "<DuckDB error string>" }                        // failure
```

Client-side comparison (`puzzle.js`):

1. If response has `error` → failed, hint: `"error"` case.
2. Memoize expected rows for this puzzle: on puzzle load, issue one `POST /run` with `puzzle.expected.sql` and cache the result in memory. Reused across all attempts on this puzzle; discarded on puzzle advance.
3. Compare player result rows to expected, ignoring order unless `order_sensitive: true`:
   - Exact match → success.
   - Row count mismatch → failed, hint: `wrong_count_high` or `wrong_count_low`.
   - Same count, different values → failed, hint: `default`.

Client-side comparison keeps the server fully general. Expected rows always match what the engine actually produces for that seed, because they're computed by executing `expected.sql` against the same connection — no hand-written expected-row arrays to drift. Cost is one extra `/run` per puzzle load.

### Save state

```js
state = {
  currentChapterId: "02-pharaoh",
  currentPuzzleId: "03",
  chapters: {
    "01-onboarding": {
      completed: true,
      solved: ["01","02","03","04","05"],
      attempts: { "01": 1, "02": 3, "03": 1, "04": 2, "05": 1 }
    },
    "02-pharaoh": {
      completed: false,
      solved: ["01","02"],
      attempts: { "01": 1, "02": 2 }
    }
  },
  referenceOpened: ["select", "from", "where"],
  savedAt: 1713700000000
}
```

Saved on every state transition. On reload, restore into current chapter + puzzle; re-init DuckDB for that chapter on first `/run`.

**No mid-puzzle save of blank values.** If you reload mid-puzzle, blanks reset. Intentional: mid-puzzle resume is complexity we don't need for ~30–90-second puzzles.

## Chapter arc

Six chapters, ~36 puzzles total. Each chapter: one era, one client, one concept cluster, one beat of the Hemiunu mystery.

### Chapter 1 — "Onboarding" (modern-day, Chrono Consulting HQ)

- **Client:** Carol walks you through your first task: audit the firm's own client ledger.
- **Concepts:** `SELECT`, `FROM`, `LIMIT` · **Mechanic:** dropdown
- **Narrative:** office tour, meet the time-portal. A weird record in the ledger: a client dated "year 87,000." Carol waves it off. *"Probably a data-entry intern."*
- **Tables:** `clients` (~20 rows, hand-authored)
- **Puzzles:** 5

### Chapter 2 — "The Pharaoh's Grain Audit" (Old Kingdom Egypt, c. 2530 BCE)

- **Client:** Pharaoh Menkaure, formally suspicious
- **Concepts:** `WHERE`, comparison operators · **Mechanic:** dropdown
- **Narrative:** grain records, year-of-reign filtering, overseer fraud. Carol notices the overseer's name — *"Hemiunu"* — also appears in Chapter 1's client ledger. She doesn't explain.
- **Tables:** `granary` (~60 rows)
- **Puzzles:** 6

### Chapter 3 — "The Speakeasy Ledger" (Chicago, 1927)

- **Client:** Gladys Vance, speakeasy owner
- **Concepts:** `ORDER BY`, `LIKE`, `NULL` handling, string functions · **Mechanic:** word bank
- **Narrative:** mechanic flip — now composing, not choosing. Gladys's bartender disappeared mid-month. Sort and filter reveal the night she met someone named *Hemiunu.* Carol goes pale.
- **Tables:** `shifts`, `patrons` (~200 rows total, hand-authored)
- **Puzzles:** 6

### Chapter 4 — "The Robber Baron's Census" (NYC, 1890)

- **Client:** Cornelius Grayson, industrialist
- **Concepts:** `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `GROUP BY` · **Mechanic:** word bank
- **Narrative:** workforce statistics for investor pitch. Census has one row too many — a resident with no borough, no employer, surname *Hemiunu.* Three timelines now.
- **Tables:** `census` (~3000 rows, Parquet, real data re-skinned)
- **Puzzles:** 6

### Chapter 5 — "Oldrich's Repeat Customers" (Prague, 1347, plague approaching)

- **Client:** Oldrich, tavern keeper
- **Concepts:** `DISTINCT`, `HAVING`, date/time functions · **Mechanic:** typing
- **Narrative:** first typing chapter; mechanic shift aligns with narrative gravity. Oldrich's most frequent patron all year, visiting weekly, is *Hemiunu.* Oldrich has never seen this person age.
- **Tables:** `visits`, `patrons` (~500 rows, hand-authored)
- **Puzzles:** 6

### Chapter 6 — "The Reunion" (all eras, back at Chrono Consulting HQ)

- **Client:** Carol + the player
- **Concepts:** `INNER JOIN`, table aliases, 2- and 3-table joins · **Mechanic:** typing
- **Narrative:** join the ledgers from every prior chapter to prove Hemiunu appears in all five. Carol reveals: Hemiunu is an unlicensed temporal operator running rogue engagements on firm infrastructure. Case closed. Carol: *"You should probably see what's going on with the observability system though."*
- **Tables:** federated views across all prior chapter seeds
- **Puzzles:** 7

### Chapter structure (uniform)

1. Cold open — boss or client dialogue sets era and task.
2. 5–7 puzzles, each a "next step" in the case.
3. Success — client pays, case closes.
4. Stinger — Carol notices something (a name, an inconsistency). Seeds next chapter.

### Curriculum totals

- 36 puzzles, ~10–15 minute sessions per chapter for a comfortable learner.
- Full playthrough: one evening binge, ~one week spaced.
- Concept coverage: `SELECT`, `FROM`, `LIMIT`, `WHERE`, comparison operators, `ORDER BY`, `LIKE`, `NULL`, `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `GROUP BY`, `DISTINCT`, `HAVING`, date/time functions, `INNER JOIN`, table aliases, multi-table joins.
- Concepts deferred to Phase 1.5 (not Phase 2): subqueries, CTEs, window functions, `UNION`, `CASE`, outer joins.

## Phase 2 (DDSQL) — sketch

Phase 2 is scoped separately after Phase 1 ships. Sketched here only to verify Phase 1 decisions don't box us in.

### Narrative bridge

Season 2 opens with Carol cornered: Chrono Consulting's own monitoring has gone dark. Time-portal telemetry is erratic, bills are wrong. The CEO (a character not yet met) is convinced Phase 1's saboteur didn't work alone. The player shifts role from era-hopping analyst to SRE-adjacent data investigator; no more time travel, one very weird modern observability stack.

### Concept areas

- Tag-based selection (`WHERE env:prod`-style, not `WHERE env = 'prod'`).
- Time windows (relative times, bucketing, granularity).
- Time-series math (rates, deltas, moving averages).
- Polymorphic table functions (PTFs) — DDSQL-specific syntax for logs, metrics, RUM, spans.
- Resource/tag joins (services → hosts → containers).

Estimated 4–6 chapters, mostly typing mode. Same Chrono Consulting framing, different office floor.

### Simulation approach

No real Datadog required. DDSQL is close enough to DuckDB SQL that we build a thin translation layer: DDSQL input → translated DuckDB → results. Tag syntax (`env:prod`) becomes `WHERE tags['env'] = 'prod'` under the hood. Time-series PTFs become DuckDB CTEs over pre-seeded Parquet files. Players write real DDSQL; engine translates and runs. Error messages match DDSQL's. Investment goes into the translator, not into authenticating to a real Datadog instance.

### Data

Fabricated telemetry datasets — sparse metric series, log samples, span traces — shipped as Parquet files. Phase 2 curriculum only; no real-customer data.

### Why Phase 1 decisions support this

- **DuckDB** — no dialect migration later.
- **JSON content** — scales fine to Phase 2's ~40 more puzzles.
- **Content-as-data engine** — Phase 2 becomes a new `content/season-2/` tree, not a cross-cutting engine change.

## Testing strategy

Kept deliberately small.

| What | How | Why |
|---|---|---|
| Content validity | `npm run validate-content` parses every JSON against schema, then runs each puzzle's `expected.sql` against its chapter's `seed.sql` in a throwaway DuckDB | Catches the majority of content bugs — typos, bad refs, broken SQL, schema drift |
| Engine unit tests | `node --test` on pure functions: row comparison, SQL assembly, hint selection | Engine logic is hard to debug from gameplay symptoms; cheap tests here pay off |
| Security suite | `node --test` server-side: attempts each prohibited statement and function category and asserts clean rejection (see Security section for exhaustive list) | Security boundaries are easy to regress silently; test them explicitly |
| End-to-end smoke | One Playwright script: boot server, load chapter 1, solve puzzle 1 canonically, confirm success state | Guards against catastrophic regressions; runs in ~10s |
| Playtesting | Manual — play end-to-end after any chapter change | Irreplaceable for pedagogy, humor, and pacing |

**Non-goals:** visual regression, load testing, accessibility automation. Rendering/DOM code is manually tested.

## Security & input validation

The `/run` endpoint executes player-submitted SQL against a DuckDB engine on the server. That SQL is untrusted input. Even for a single-player learning game this matters, because any public deployment (or even a shared dev machine) could let a player escape from the sandbox that the "puzzle" concept implies.

### Threat model

- **Statement abuse** — non-SELECT statements (`DROP`, `DELETE`, `INSERT`, `CREATE`, `ALTER`, `COPY ... TO`, `ATTACH`) that would mutate state, exfiltrate data to disk, or disrupt the game session.
- **Filesystem reads** — DuckDB's `read_csv`, `read_parquet`, `read_json`, `read_blob`, `read_text`, `glob`, etc. would expose arbitrary server filesystem contents through a harmless-looking SELECT.
- **Extension loading** — `LOAD` and `INSTALL` can pull in extensions (`httpfs`, `postgres`, etc.) that expand DuckDB's capability surface substantially.
- **Resource exhaustion** — pathological queries (massive CROSS JOINs, recursive CTEs, large projections) that consume CPU or memory.
- **Response-size abuse** — a legitimate SELECT returning millions of rows that overwhelm the network or client.

### Mitigations (defense in depth)

All mitigations apply at the server boundary — never trust client-side checks alone.

1. **Statement allow-list.** Parse incoming SQL with DuckDB's own statement parser (`duckdb_extract_statements` or the Node API equivalent). Reject if the statement type is anything other than `SELECT` (including `WITH ... SELECT`). No DDL, no DML, no `COPY`, no `LOAD`/`INSTALL`, no `ATTACH`, no `PRAGMA` that could mutate state. Rejection returns `{ error: "Only SELECT queries are allowed" }` and the client routes it to the `error` hint so the player sees an in-character nudge.
2. **Function-name blocklist.** Walk the parsed SELECT's expression tree and reject any reference to filesystem-access functions: `read_csv*`, `read_parquet*`, `read_json*`, `read_blob`, `read_text`, `glob`, `parquet_*_metadata`, `sniff_csv`. Seed SQL loads Parquet/CSV *once at chapter init*; player queries only touch pre-loaded tables. A blocklist is acceptable here because DuckDB's I/O function names are a small, stable, documented set; new ones land in major-version releases.
3. **Connection-level filesystem disable.** After `seed.sql` completes for a chapter, call `SET disabled_filesystems = 'LocalFileSystem';` (and equivalents for any URL schemes) so even an unblocked function can't reach the disk. Belt-and-suspenders with mitigation #2.
4. **Read-only connection after seed.** Switch the chapter's connection to read-only (`SET access_mode = 'READ_ONLY'` or an equivalent at open time) once seeding is done. Any allow-listed statement that *would* somehow try to mutate is rejected at the engine level.
5. **No extensions loaded.** Ship with DuckDB core only; do not install `httpfs`, `postgres`, `json` (unless specifically required by a seed), etc. Extensions are the widest capability-expansion surface — keep the default empty.
6. **Query timeout.** Set a 5-second statement timeout per player query. On timeout, abort and return `{ error: "Query took too long — try simplifying" }`, routed to the `error` hint.
7. **Row limit on response.** Cap returned rows at 10,000. If the player's query would return more, truncate the response and set a `truncated: true` flag so the client can show a gentle "result was truncated" hint. Players never legitimately need more than this for a puzzle; any query returning more is either bugged or adversarial.
8. **Request body limits.** Cap incoming POST body size (e.g., 64 KB). SQL puzzles never legitimately need more.

### What is NOT mitigated (acceptable residual risk)

- Queries that complete within the 5-second timeout but maximize CPU during that window. Single-player game; acceptable.
- A player persistently sending borderline-pathological queries. Rate-limiting is out of scope for v1; if abuse becomes a problem after public launch, a per-IP token bucket can be added to `/run`.
- Client-side tampering (rewriting POST bodies, bypassing the UI). All validation lives on the server, so tampered requests land in the same mitigations above.

### Testing

Add to the testing strategy: a server-side security suite that attempts each prohibited statement and function category and asserts a clean rejection (not an engine crash, not a success). Examples:

- `DROP TABLE granary` → rejected, statement allow-list
- `SELECT * FROM read_csv('/etc/passwd')` → rejected, function blocklist
- `LOAD httpfs` → rejected, statement allow-list
- `COPY granary TO '/tmp/steal.csv'` → rejected, statement allow-list
- `WITH RECURSIVE r AS (...) SELECT * FROM r` taking > 5s → timeout error returned
- SELECT returning 50,000 rows → truncated response with flag

Run this suite in CI on every change to `server.js`.

### Implications for Phase 2 (DDSQL)

The DDSQL translation layer must apply the same mitigations *after* translation. DDSQL's PTF syntax and tag syntax will translate into DuckDB SQL that still needs validation — a malicious DDSQL input that translates to `SELECT * FROM read_parquet(...)` is just as dangerous. Treat the translator's output as untrusted and feed it back through the same allow-list/blocklist.

## Error handling

| Where | Failure | Behavior |
|---|---|---|
| `/run` endpoint | Malformed body, missing chapter, over size limit | 400 with `{ error }`; client shows generic "something went wrong" dialogue, no puzzle fail |
| `/run` endpoint | Security rejection (non-SELECT, blocked function, etc. — see Security section) | 400 with `{ error: "Only SELECT queries are allowed" }` or similar; client routes to `error` hint; puzzle stays in composing |
| `/run` endpoint | Query timeout (5s) or row limit exceeded | 200 with `{ error: "Query took too long..." }` or `{ rows, truncated: true }`; client shows in-character hint |
| DuckDB seed init | Seed file syntax error | Server logs + 500; client shows "Carol frowns: 'the archives for this era won't load. Try reloading.'" |
| Player's SQL | Syntax error | Return `{ error }`; client routes to `error` hint; puzzle stays in composing |
| Player's SQL | Wrong rows | Return rows normally; client compares; routes to `default` / `wrong_count_*` hint |
| Content load | 404 or malformed JSON | Fatal; full-screen "Chrono Consulting's archive is offline"; no fallback |
| localStorage save | Quota exceeded | Console log; keep playing; save is opportunistic, not blocking |

## Rollout plan

Five milestones. Phase 2 starts after Milestone E ships and gets real-player feedback.

1. **Milestone A — Engine + Chapter 1.** Server, frontend, dropdown renderer, reference drawer, dialogue system, localStorage. One chapter end-to-end. First internal playtest.
2. **Milestone B — Chapter 2 + dropdown polish.** Second chapter in dropdown mode. Hint pattern-matching refinements from A.
3. **Milestone C — Word bank renderer + Chapters 3–4.** Mechanic-mode 2 added. Real Parquet data for Chapter 4.
4. **Milestone D — Typing renderer + Chapters 5–6.** Mechanic-mode 3 added. Season finale. Full-game playthrough.
5. **Milestone E — Polish pass.** Reference drawer review. Error-message review. Performance check (chapter switch, first-run cold init).

## Deployment

`node server.js` on any Node host. Candidates: $5 droplet, personal Mac, static-ish hosting for frontend + backend-as-a-service for `/run`. Pick at ship time. No CI/CD needed — whole game is ~20 code files; `git pull && pm2 restart` is sufficient.

## Open questions

- Nothing currently blocking Phase 1. All decisions captured above. Any drift discovered during implementation should trigger a spec update, not silent deviation.
