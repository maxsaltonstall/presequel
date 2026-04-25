---
title: Chapter 5 — "Oldrich's Repeat Customers" — Design
date: 2026-04-25
status: draft
phase: Phase 1, Chapter 5 of 6
---

# Chapter 5 — "Oldrich's Repeat Customers" — Design

## Summary

Fifth chapter of Phase 1. Concepts: `DISTINCT`, `HAVING`, date/time functions. First chapter to use the **typing mechanic** — players type free-text into template blanks instead of picking from dropdowns or chips. Setting: Prague, 1347, plague approaching. Client: Oldrich, a tavern keeper. The case ends with the player finding the patron who has visited Oldrich's tavern every Wednesday of the year. Oldrich knows his face. He has not aged.

This is the second-to-last chapter of Phase 1; Chapter 6 (the season finale, JOIN-driven) follows.

## Goals

- Teach `DISTINCT`, `HAVING`, and date/time functions (`DATE_TRUNC`, `EXTRACT`) through a single coherent investigation.
- Introduce the typing mechanic without abandoning the template scaffolding the player relied on through Chapters 1–4.
- Continue the season arc — escalate Hemiunu from a name in ledgers to a person an honest man has poured drinks for.
- Set up Chapter 6's reveal: every prior chapter has a Hemiunu, and the player needs JOINs to put them on the same page.

## Non-goals

- Free-form SQL editor with no template (deferred — too steep a jump from word-bank).
- JOINs of any kind (Chapter 6's territory).
- Subqueries, CTEs, window functions (Phase 1.5).
- Fancy date/time function coverage — `DATE_TRUNC` and `EXTRACT` only. `DATE_DIFF`, intervals, time zones, formatting all stay out.

## Mechanic — typed blanks

Existing chapters use blanks with `mode: "dropdown"` (Chapter 1, 2, 4) or `mode: "wordbank"` (Chapter 3). Chapter 5 introduces `mode: "typed"`. The template structure is unchanged: SELECT — FROM — WHERE — etc., with named blanks the engine assembles into a SQL string. The only change is the renderer for typed blanks shows a text input instead of a dropdown or chip slot, and the player types whatever they think belongs there.

Validation pipeline stays exactly as it is: assemble SQL → run on the chapter's DuckDB connection → compare rows. Whatever the player typed either produces the expected rows (success), produces wrong rows (`wrong_count_*` or `wrong_data` hint), or produces a DuckDB error (`error` hint — typo, missing quotes, bad column name).

The diegetic explanation for the mechanic shift, delivered by Carol in the cold open: Oldrich keeps his books on parchment with a candle. There is no form. There are no blanks. You write the query yourself.

### Schema additions

`content/chapters/05-tavern/puzzles/*.json` blanks gain a third mode:

```json
{ "type": "blank", "id": "col", "mode": "typed", "placeholder": "column name" }
```

The optional `placeholder` hints at what kind of token belongs there without giving the answer. No new fields beyond `mode` and `placeholder`.

### Renderer

Add a typed-blank branch to the puzzle renderer alongside dropdown and word-bank. Reads `placeholder` if present, falls back to a generic "type here". Submits on the same control as the other modes.

### Hint behavior

Typed input produces three failure shapes:
1. **Syntax error from DuckDB** — fires the `error` hint. Existing infrastructure.
2. **Right shape, wrong rows** — fires `wrong_count_high` / `wrong_count_low` / `wrong_data`. Existing.
3. **Empty input** — engine treats blank as a no-op SQL fragment, which usually parses into something invalid → caught by case 1. No special handling.

## Data — `patrons` and `visits`

Two new tables, hand-authored, ~540 rows total.

### `patrons` (~40 rows)

```sql
CREATE TABLE patrons (
  patron_id     INT PRIMARY KEY,
  name          TEXT NOT NULL,
  occupation    TEXT NOT NULL,
  home_village  TEXT
);
```

Names + occupations evocative of 14th-century Bohemia: `Mireska the Weaver`, `Zdeněk the Cartwright`, `Vlastimila the Midwife`, `Father Ondřej`, `Pavel the Blacksmith`, etc. Cosmetic but useful — the player sees these in result sets.

Hemiunu sits in the table with `occupation = 'traveler'` and `home_village = NULL`. His patron_id is something unremarkable — not 1, not 42, somewhere in the middle.

### `visits` (~500 rows)

```sql
CREATE TABLE visits (
  visit_id       INT PRIMARY KEY,
  patron_id      INT NOT NULL,
  visit_date     DATE NOT NULL,
  tab_groschen   INT NOT NULL
);
```

Dates span the full year 1347 (Jan 1 – Dec 31). `tab_groschen` is the silver coin tab for that visit (1 = nursing one cup; 8 = a long evening with friends).

### Hemiunu's plant pattern

- Visits every Wednesday, weeks 1 through 52 of 1347. Exactly 52 visits, one per week, always Wednesday.
- `tab_groschen = 1` every visit. He nurses one cup. He doesn't stay long.
- The signal: `COUNT(DISTINCT DATE_TRUNC('week', visit_date)) = 52` — no other patron spans more than ~30 distinct weeks.

### Distraction patrons

Hand-tuned so the finale query (≥50 distinct weeks) returns exactly one row, and intermediate puzzles surface different "winners":

- **Pavel the Blacksmith** — heavy regular, ~80 visits across March–June. High total visit count (top of the GROUP BY in puzzle 03). Spans ~17 distinct weeks. *Wrong answer to the finale, right answer to "who comes most often."*
- **Mireska the Weaver** — 30 visits over ~25 weeks, Sundays. Used as the "show me her months" patron in puzzle 05.
- **Father Ondřej** — visits clustered around feast days. Useful for `EXTRACT(MONTH FROM ...)` lookups.
- **The market-day merchants** — three patrons with visits clustered on Fridays in April–October.
- **~32 other patrons** — 1–25 visits each, scattered.

Total ~500 visits. Distribution chosen so:
- Puzzle 03 (`COUNT(*) GROUP BY patron_id`) returns Pavel at the top.
- Puzzle 04 (`HAVING COUNT(*) >= 20`) returns ~6 patrons (the "regulars").
- Puzzle 06 (`HAVING weeks >= 50`) returns exactly one — Hemiunu.

### Plague flavor

Late-1347 visit volume thins for non-Hemiunu patrons (rumors of plague reach Prague by autumn; people stay home). Hemiunu keeps coming. This is a subtle data signal the player can notice but isn't required to. The October–December slice is intentionally lighter to make the "but Hemiunu didn't miss a Wednesday" beat land.

## Puzzle arc

| # | Concept | Player query (rough shape) | Reveals |
|---|---|---|---|
| 01 | `SELECT` refresher, see `visits` | `SELECT * FROM visits LIMIT 10` | The data exists. Player meets the schema. |
| 02 | `DISTINCT` | `SELECT COUNT(DISTINCT patron_id) FROM visits` | ~40 unique patrons all year. |
| 03 | `COUNT` + `GROUP BY` (refresher) | `SELECT patron_id, COUNT(*) ... GROUP BY patron_id ORDER BY ... DESC` | Pavel comes most often (~80 visits). |
| 04 | `HAVING` | `... GROUP BY patron_id HAVING COUNT(*) >= 20` | The regulars — six patrons. |
| 05 | Date function (`EXTRACT(MONTH ...)`) | `SELECT EXTRACT(MONTH FROM visit_date) AS month, COUNT(*) ... WHERE patron_id = 17 GROUP BY month` | Mireska's monthly cadence. Player learns to slice by date piece. |
| 06 | **Combined — the Hemiunu reveal** | `SELECT patron_id, COUNT(DISTINCT DATE_TRUNC('week', visit_date)) AS weeks FROM visits GROUP BY patron_id HAVING weeks >= 50` | Exactly one patron_id. Oldrich looks it up. |

The finale uses every concept taught in the chapter: `DISTINCT` (over week values), `GROUP BY` + `HAVING` (filter on aggregate), `DATE_TRUNC` (extract the week). It also requires the player to understand that "weeks visited" is not the same as "total visits" — Pavel has more visits but fewer distinct weeks.

The result returns `patron_id` only, not name. The success beat shows Oldrich looking the id up in his patron register. Joining to `patrons` to get the name would require Chapter 6's JOIN — and that's the point.

## Narrative — first draft

Tone: Carol is dry and tired. Oldrich is suspicious, gossipy, fond of his patrons in a flinty way. Plague is in the air without being named in every line. The mystery escalates: prior chapters had Hemiunu in the data. This is the first chapter where someone has *seen* him.

### Cold open (Carol)

> Carol drops a sealed scroll on the desk. "Bohemia. 1347. Tavern keeper named Oldrich. He thinks his books don't match his memory." She pauses. "Worth noting — he doesn't keep his books the way the others did. No forms with neat little boxes. Parchment and a candle and a man who can read. You're going to have to write the queries yourself this time."
>
> She turns to leave, then stops at the doorway.
>
> "He's also asked us to hurry. There's plague in the south. He doesn't know how long he'll have customers."

### Per-puzzle dialogue

**Puzzle 01 — "Open the books"**
- *brief*: Oldrich: "Every pour. Every coin. A year of it. Look at the book before you ask me anything."
- *success*: Oldrich grunts. "Now you've seen it. Ask me what you want."

**Puzzle 02 — "How many faces?"**
- *brief*: Oldrich: "How many different mouths have I served this year? Not how many cups — how many people. I am not a charity."
- *success*: "More than I thought. Some I'd have to think hard to picture."

**Puzzle 03 — "Who comes most?"**
- *brief*: Oldrich: "Who do I see the most of? I'd like to know who I owe a cup to. Or who I should be charging more."
- *success*: Oldrich nods. "Pavel. Sounds right. He's been miserable since his wife died — drinks like a fish, leaves like a ghost."

**Puzzle 04 — "Just the regulars"**
- *brief*: Oldrich: "Just the ones I'd call regulars. Twenty visits or more. Less than that, they're strangers to me."
- *success*: "Six. Yes. Six faces I'd recognize at the well in the morning."

**Puzzle 05 — "Mireska's rhythm"**
- *brief*: Oldrich: "Mireska — patron 17, the weaver — comes back like the tide. Show me her visits by month. I'd swear she keeps to a pattern even she doesn't know about."
- *success*: "Sundays. Always Sundays. After mass. She tells me she's praying for her sister; I think she's praying for herself."

**Puzzle 06 — "The face that doesn't change"**
- *brief*: Oldrich is quiet for a moment.
  > "There's one I want you to find for me. He comes in every Wednesday. Every single Wednesday of this whole damned year. Sits at the corner. Drinks one cup. Doesn't talk. Doesn't stay. I've poured for fathers and their sons in this room — I've watched men grow grey at that bench. This one looks the same as the day he walked in. The same. Find me the patron who came on at least fifty different weeks of 1347. Tell me his id. I'll look him up myself."
- *success*: Oldrich opens his patron register. He reads the id off your result. He stares at the page for a long moment. He looks up.
  > "Hemiunu," he says. "Just Hemiunu. No surname. No village. He paid in old coin." He closes the book carefully. "I don't want to be in this conversation anymore."

### Outro / Chapter 6 stinger

> Back at Chrono Consulting. Carol reads your working papers, the patron register entry pinned to the top. She doesn't say anything for a while.
>
> Then she lays four pages on her desk, side by side. Old Kingdom Egypt. 1920s Chicago. 1890 New York. 1347 Prague. Hemiunu in every one.
>
> "The CEO didn't return my call last week. He won't this week either." She picks up the phone anyway. "Pull every chapter's ledger from records. All of them. We're going to put them on the same page."
>
> She hangs up.
>
> "Hope you've been thinking about how to read more than one table at a time."

## Engine changes

Minimal. All changes additive; existing chapters untouched.

1. **Renderer** (`src/puzzle.js` or wherever the blank-rendering switch lives): add a `typed` case that emits an `<input type="text">` with the `placeholder` attribute set from the puzzle JSON. Wire its value into the same submit pipeline as the other modes.
2. **Chapter wiring** (`src/main.js` or equivalent dispatcher): `chapter.json` for chapter 5 sets `"mechanic_mode": "typing"`. The `playPuzzle` dispatcher already routes by mechanic_mode for word-bank vs dropdown — extend the switch.
3. **Speakers**: add `oldrich` to `SPEAKERS` with a chat-bubble color/style consistent with prior NPCs. Carol already exists.
4. **CHAPTER_ORDER**: append `05-tavern`.
5. **Reference drawer concepts**: add markdown for `distinct`, `having`, `date-functions`. Wire into the chapter's `reference_concepts`.

No backend changes. Security validator already allows the date functions DuckDB ships with by default, and `DATE_TRUNC` / `EXTRACT` are not on the filesystem-access blocklist.

## Testing

Match the existing pattern — content validator + small targeted unit tests + Playwright smoke + manual checklist.

- **Content validator**: every Chapter 5 puzzle's `expected.sql` runs against the chapter seed and produces the expected row count. Already automatic via `npm run validate-content`.
- **Engine unit tests** (`tests/typed-blank-assembly.test.js` — new): the SQL assembler, given a template with one or more `typed` blanks and the player's typed values, produces the expected SQL string. A handful of cases — single blank, multiple blanks, whitespace handling, empty input.
- **Playwright smoke**: extend the existing E2E spec to play Puzzle 01 of Chapter 5 — type the canonical answer into the blanks, submit, verify success state. Keeps the smoke test bounded.
- **Manual playtest checklist** (`docs/playtest-checklist.md`): add a Chapter 5 section — boot, navigate, attempt each puzzle with a wrong answer to verify the hint copy, attempt with the right answer, confirm success state and reference drawer wiring. Confirm the typing inputs render and accept text on Chrome and Safari. Confirm the chapter 6 stinger copy renders correctly.

## Dependencies / prereqs

- Reference markdown files needed: `content/reference/distinct.md`, `content/reference/having.md`, `content/reference/date-functions.md` (covers `DATE_TRUNC` and `EXTRACT` with examples; intentionally narrow).
- No new npm packages.
- No security validator changes (date functions are vanilla DuckDB).

## Open questions / things to confirm in the implementation plan

- The exact distribution of the 500 `visits` rows is hand-authoring work. Worth a small generator script (or done by hand?) that produces a deterministic seed file and a comment explaining each patron's pattern. Defer the "generator vs hand-author" call to the plan.
- Hemiunu's `patron_id` value. Pick something unmemorable (not 1, not 42, not 13) so the player has to actually run the finale query and not just guess. Final pick lives in the seed.
- Whether typed-blank inputs should grow horizontally as the player types, or stay fixed-width and scroll. UX detail; punt to the implementation step.
