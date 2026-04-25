# SQL Learning Game — Milestone B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chapter 2 "The Pharaoh's Grain Audit" end-to-end. After Milestone B a player can finish Chapter 1, click through to Chapter 2, and solve 6 dropdown puzzles teaching WHERE + comparison operators while the Hemiunu season arc gets its first direct surface.

**Architecture:** Content-additive only. New `content/chapters/02-pharaoh/` tree (seed, chapter.json, 6 puzzle JSONs) + two new reference markdown files + small edits to `src/reference.js` (concepts map) and `src/dialogue.js` (add Pharaoh speaker). No engine changes.

**Tech Stack:** Same as Milestone A — no new dependencies.

**What ships at the end of Milestone B:**
- Chapter 2 playable end-to-end from Chapter 1's Next button
- 6 new puzzles in dropdown mode teaching WHERE + 6 comparison operators
- Pharaoh Menkaure speaks in Chapter 2 dialogue bubbles with his own label
- Reference drawer gains WHERE + comparison operators entries for Chapter 2
- Hemiunu surfaces diegetically (player sees the name while filtering)
- Playwright smoke extended to cover the Ch1 → Ch2 transition
- All unit/integration/content-validator/e2e tests green

---

## File Structure

Files created in this milestone:

- `content/chapters/02-pharaoh/chapter.json`
- `content/chapters/02-pharaoh/seed.sql`
- `content/chapters/02-pharaoh/puzzles/01.json` through `06.json`
- `content/reference/where.md`
- `content/reference/comparison-operators.md`

Files modified:

- `src/dialogue.js` — extend SPEAKERS map with Pharaoh entry (Carol + generic client already present)
- `src/reference.js` — extend CONCEPTS_FOR_CHAPTER with `02-pharaoh`
- `tests/e2e-smoke.spec.js` — add chapter-transition test
- `docs/playtest-checklist.md` — add Chapter 2 sub-checklist

---

## Phase 0 — Engine glue (tiny)

### Task 1: Engine glue for Chapter 2

**Files:**
- Modify: `src/dialogue.js`
- Modify: `src/reference.js`

- [ ] **Step 1: Extend SPEAKERS in src/dialogue.js**

Current:
```js
const SPEAKERS = {
  carol: { label: 'Carol', role: 'boss' },
  client: { label: 'Client', role: 'client' },
  pharaoh: { label: 'Pharaoh Menkaure', role: 'client' },
  // Later chapters add more; unknown speakers fall through to "Client"
};
```

The `pharaoh` entry is already present from Milestone A scaffolding — verify it matches. No change needed unless it's absent.

- [ ] **Step 2: Extend CONCEPTS_FOR_CHAPTER in src/reference.js**

Current:
```js
const CONCEPTS_FOR_CHAPTER = {
  '01-onboarding': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
  ],
};
```

Change to:
```js
const CONCEPTS_FOR_CHAPTER = {
  '01-onboarding': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
  ],
  '02-pharaoh': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
  ],
};
```

Chapter 2's drawer shows all 5 concepts (Ch1 concepts remain available — the drawer cumulates).

Also reset `currentSlug` on chapter change (minor fix from the final review):

Find:
```js
export function setChapterForReference(chapterId) {
  const nav = document.getElementById('ref-nav');
  nav.innerHTML = '';
```

Change to:
```js
export function setChapterForReference(chapterId) {
  const nav = document.getElementById('ref-nav');
  nav.innerHTML = '';
  currentSlug = null;
```

- [ ] **Step 3: Commit**

```bash
git add src/dialogue.js src/reference.js
git commit -m "$(cat <<'EOF'
Add Chapter 2 concepts to reference drawer; reset current slug on chapter change

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — Chapter 2 content

### Task 2: Chapter 2 seed, metadata, and reference markdown

**Files:**
- Create: `content/chapters/02-pharaoh/seed.sql`
- Create: `content/chapters/02-pharaoh/chapter.json`
- Create: `content/reference/where.md`
- Create: `content/reference/comparison-operators.md`

- [ ] **Step 1: Create seed.sql (granary table, ~60 rows)**

Create `content/chapters/02-pharaoh/seed.sql`:

```sql
-- Chapter 2: The Pharaoh's Grain Audit
-- Granary records from Menkaure's reign, years 1-12.
-- Spread across three royal silos: Giza, Memphis, Saqqara.
-- One anomalous entry: an overseer named "Hemiunu" in year 9 with
-- an unusually small delivery. Menkaure senses something is off.

CREATE TABLE granary (
  id         INTEGER,
  overseer   VARCHAR,
  year       INTEGER,
  amount     INTEGER,
  silo       VARCHAR
);

INSERT INTO granary VALUES
  -- Year 1 (establishing reign)
  (1,  'Weni',         1,  2400, 'Giza'),
  (2,  'Imhotep',      1,  1800, 'Memphis'),
  (3,  'Rahotep',      1,  2100, 'Saqqara'),
  (4,  'Weni',         1,  2600, 'Giza'),
  (5,  'Meryet',       1,  1500, 'Memphis'),
  -- Year 2
  (6,  'Weni',         2,  2700, 'Giza'),
  (7,  'Kagemni',      2,  2200, 'Memphis'),
  (8,  'Imhotep',      2,  2000, 'Memphis'),
  (9,  'Rahotep',      2,  2400, 'Saqqara'),
  (10, 'Akhethotep',   2,  1900, 'Saqqara'),
  -- Year 3
  (11, 'Weni',         3,  3100, 'Giza'),
  (12, 'Kagemni',      3,  2600, 'Memphis'),
  (13, 'Meryet',       3,  1800, 'Memphis'),
  (14, 'Rahotep',      3,  2800, 'Saqqara'),
  (15, 'Mereruka',     3,  2100, 'Giza'),
  -- Year 4
  (16, 'Weni',         4,  2900, 'Giza'),
  (17, 'Imhotep',      4,  2300, 'Memphis'),
  (18, 'Akhethotep',   4,  2000, 'Saqqara'),
  (19, 'Meryet',       4,  1700, 'Memphis'),
  (20, 'Rahotep',      4,  2500, 'Saqqara'),
  -- Year 5
  (21, 'Mereruka',     5,  3200, 'Giza'),
  (22, 'Weni',         5,  2800, 'Giza'),
  (23, 'Kagemni',      5,  2400, 'Memphis'),
  (24, 'Imhotep',      5,  2100, 'Memphis'),
  (25, 'Rahotep',      5,  2700, 'Saqqara'),
  -- Year 6
  (26, 'Weni',         6,  3000, 'Giza'),
  (27, 'Meryet',       6,  1900, 'Memphis'),
  (28, 'Akhethotep',   6,  2200, 'Saqqara'),
  (29, 'Mereruka',     6,  3100, 'Giza'),
  (30, 'Rahotep',      6,  2600, 'Saqqara'),
  -- Year 7
  (31, 'Weni',         7,  2850, 'Giza'),
  (32, 'Kagemni',      7,  2400, 'Memphis'),
  (33, 'Imhotep',      7,  2000, 'Memphis'),
  (34, 'Meryet',       7,  1650, 'Memphis'),
  (35, 'Akhethotep',   7,  1850, 'Saqqara'),
  -- Year 8
  (36, 'Weni',         8,  3300, 'Giza'),
  (37, 'Mereruka',     8,  2900, 'Giza'),
  (38, 'Kagemni',      8,  2500, 'Memphis'),
  (39, 'Rahotep',      8,  2750, 'Saqqara'),
  (40, 'Akhethotep',   8,  2100, 'Saqqara'),
  -- Year 9 — THE ANOMALY LIVES HERE
  (41, 'Weni',         9,  3100, 'Giza'),
  (42, 'Mereruka',     9,  3050, 'Giza'),
  (43, 'Kagemni',      9,  2400, 'Memphis'),
  (44, 'Hemiunu',      9,   420, 'Giza'),   -- suspicious: tiny amount, unknown overseer
  (45, 'Rahotep',      9,  2700, 'Saqqara'),
  (46, 'Meryet',       9,  1800, 'Memphis'),
  -- Year 10
  (47, 'Weni',        10,  3200, 'Giza'),
  (48, 'Mereruka',    10,  2950, 'Giza'),
  (49, 'Imhotep',     10,  2300, 'Memphis'),
  (50, 'Kagemni',     10,  2500, 'Memphis'),
  (51, 'Rahotep',     10,  2800, 'Saqqara'),
  -- Year 11
  (52, 'Weni',        11,  3000, 'Giza'),
  (53, 'Akhethotep',  11,  2200, 'Saqqara'),
  (54, 'Meryet',      11,  1750, 'Memphis'),
  (55, 'Mereruka',    11,  3100, 'Giza'),
  (56, 'Rahotep',     11,  2650, 'Saqqara'),
  -- Year 12
  (57, 'Weni',        12,  3400, 'Giza'),
  (58, 'Imhotep',     12,  2400, 'Memphis'),
  (59, 'Kagemni',     12,  2600, 'Memphis'),
  (60, 'Rahotep',     12,  2850, 'Saqqara');
```

- [ ] **Step 2: Create chapter.json**

Create `content/chapters/02-pharaoh/chapter.json`:

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
  "boss_intro": "Carol hands you a papyrus. 'Menkaure again. He swears his granaries are off by a few sacks and he wants us to find out who. The WHERE clause is what you need — it filters rows. I'll stop explaining as you go.'",
  "concepts_introduced": ["where", "comparison-operators"],
  "concepts_reviewed": ["select", "from"],
  "mechanic_mode": "dropdown",
  "arc_hook": "An overseer named Hemiunu logs one odd entry in year 9. Menkaure fixates on it. You'll fixate on it too.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "Menkaure is satisfied. His scribes will sort out Hemiunu. Carol, back at the office, looks pale: 'That name. Hemiunu. He was on our own client ledger yesterday. Year 4.' She doesn't say more."
}
```

- [ ] **Step 3: Create reference/where.md**

Create `content/reference/where.md`:

```markdown
---
concept: where
title: WHERE
introduced_in: 02-pharaoh
---

# WHERE

`WHERE` filters which rows are returned. It goes after `FROM`, and it takes a condition — a true/false expression evaluated per row. Only rows where the condition is true come back.

## Syntax
```
SELECT columns FROM table WHERE condition
```

## Example

Return only clients whose era is Old Kingdom Egypt:
```
SELECT name FROM clients WHERE era = 'Old Kingdom Egypt'
```

Return granary entries from year 9 or later:
```
SELECT overseer, amount FROM granary WHERE year >= 9
```

## Gotchas

- Text values go in single quotes: `WHERE name = 'Menkaure'`.
- Integer values do NOT: `WHERE year = 9`, not `WHERE year = '9'`.
- `WHERE` comes before `LIMIT`.
```

- [ ] **Step 4: Create reference/comparison-operators.md**

Create `content/reference/comparison-operators.md`:

```markdown
---
concept: comparison-operators
title: Comparison operators
introduced_in: 02-pharaoh
---

# Comparison operators

Inside a `WHERE` condition, six operators compare values:

| Operator | Meaning | Example |
|---|---|---|
| `=`  | equals | `year = 9` |
| `!=` | not equal | `overseer != 'Hemiunu'` |
| `>`  | greater than | `amount > 2000` |
| `<`  | less than | `amount < 500` |
| `>=` | greater or equal | `year >= 5` |
| `<=` | less or equal | `amount <= 1000` |

## With text

All six operators work on strings using alphabetical order — but you'll almost always use `=` or `!=` with text.

```
SELECT * FROM granary WHERE overseer = 'Weni'
SELECT * FROM granary WHERE overseer != 'Weni'
```

## With numbers

Numeric comparisons are what you expect:

```
SELECT * FROM granary WHERE amount > 3000    -- big shipments
SELECT * FROM granary WHERE year <= 3        -- Menkaure's first 3 years
```
```

- [ ] **Step 5: Validate**

Run: `npm run validate-content`
Expected: passes. Confirms chapter.json schema + that seed + expected.sql for existing Chapter 2 puzzles all execute. (Puzzles don't exist yet, so there's nothing to execute in Ch2 — validator only checks schema of files that are present.)

- [ ] **Step 6: Commit**

```bash
git add content/chapters/02-pharaoh/seed.sql content/chapters/02-pharaoh/chapter.json content/reference/where.md content/reference/comparison-operators.md
git commit -m "$(cat <<'EOF'
Add Chapter 2 seed, metadata, and reference markdown

Pharaoh Menkaure's granary audit: 60-row granary table across 12 years
of reign, three silos, eight overseers. Year 9 contains the Hemiunu
anomaly entry — the season arc's first direct surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Chapter 2 puzzles 01–06

Each puzzle teaches one comparison operator. Menkaure's dialogue escalates from formal-suspicious to openly alarmed as Hemiunu's entry emerges.

**Files:**
- Create: `content/chapters/02-pharaoh/puzzles/01.json`
- Create: `content/chapters/02-pharaoh/puzzles/02.json`
- Create: `content/chapters/02-pharaoh/puzzles/03.json`
- Create: `content/chapters/02-pharaoh/puzzles/04.json`
- Create: `content/chapters/02-pharaoh/puzzles/05.json`
- Create: `content/chapters/02-pharaoh/puzzles/06.json`

- [ ] **Step 1: Puzzle 01 — WHERE with text equality**

`content/chapters/02-pharaoh/puzzles/01.json`:

```json
{
  "id": "01",
  "concept": "where",
  "brief": {
    "speaker": "pharaoh",
    "text": "Find every delivery logged by the overseer named Weni. He has been my most reliable man for a decade. Let us see his work."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "overseer, year, amount" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "granary" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",  "mode": "dropdown",
      "options": ["overseer", "silo", "year"] },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": ["=", ">", "<"] },
    { "type": "blank",   "id": "val",  "mode": "dropdown",
      "options": ["'Weni'", "'Hemiunu'", "9"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT overseer, year, amount FROM granary WHERE overseer = 'Weni'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Pharaoh: 'Too many entries. Weni was one man, not many.'" },
    { "when": "wrong_count_low",  "text": "Pharaoh: 'That cannot be all of Weni's work. Check your comparison.'" },
    { "when": "error",            "text": "Pharaoh: 'Your scribes are baffled. Text values need single quotes.'" },
    { "when": "default",          "text": "Pharaoh: 'The filter must find the overseer whose name is Weni.'" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "Weni's records. Year after year. A good man. You may proceed."
  }
}
```

- [ ] **Step 2: Puzzle 02 — WHERE with integer equality (reveals Hemiunu)**

`content/chapters/02-pharaoh/puzzles/02.json`:

```json
{
  "id": "02",
  "concept": "where",
  "brief": {
    "speaker": "pharaoh",
    "text": "My ninth year of reign. Something... a feeling. Show me every entry from year 9."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "overseer, amount" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "granary" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",  "mode": "dropdown",
      "options": ["year", "amount", "overseer"] },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": ["=", ">=", ">"] },
    { "type": "blank",   "id": "val",  "mode": "dropdown",
      "options": ["9", "'9'", "19"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT overseer, amount FROM granary WHERE year = 9",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Pharaoh: 'Too many years. I asked for only year nine.'" },
    { "when": "wrong_count_low",  "text": "Pharaoh: 'Not enough. Six scribes logged in year 9. Where are they all?'" },
    { "when": "error",            "text": "Pharaoh: 'The year is a number. Not a text. Remove the quotes.'" },
    { "when": "default",          "text": "Pharaoh: 'Filter the granary to exactly year 9. The integer, not the text.'" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "Six entries. Five names I know. And... Hemiunu. I do not know this overseer. A strangely small delivery. Continue."
  }
}
```

- [ ] **Step 3: Puzzle 03 — WHERE with greater-than (big shipments)**

`content/chapters/02-pharaoh/puzzles/03.json`:

```json
{
  "id": "03",
  "concept": "comparison-operators",
  "brief": {
    "speaker": "pharaoh",
    "text": "I would see only the great deliveries. Two thousand units or more are significant. Filter for them."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "overseer, year, amount" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "granary" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",  "mode": "dropdown",
      "options": ["amount", "year", "id"] },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": [">", "<", "="] },
    { "type": "blank",   "id": "val",  "mode": "dropdown",
      "options": ["2000", "200", "20000"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT overseer, year, amount FROM granary WHERE amount > 2000",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Pharaoh: 'Too many. 2000 is the threshold — only strictly greater.'" },
    { "when": "wrong_count_low",  "text": "Pharaoh: 'Too few. 2000 is the threshold, not 20000.'" },
    { "when": "default",          "text": "Pharaoh: 'Amount must be greater than 2000.'" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "The harvest of kings. Weni. Mereruka. Rahotep. Their work is proof enough."
  }
}
```

- [ ] **Step 4: Puzzle 04 — WHERE with >= (everything from year 5 onward)**

`content/chapters/02-pharaoh/puzzles/04.json`:

```json
{
  "id": "04",
  "concept": "comparison-operators",
  "brief": {
    "speaker": "pharaoh",
    "text": "My later years — year 5 onward. Include year 5 itself. I would see the whole of that second half."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "overseer, year" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "granary" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "year" },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": [">=", ">", "="] },
    { "type": "blank",   "id": "val",  "mode": "dropdown",
      "options": ["5", "4", "6"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT overseer, year FROM granary WHERE year >= 5",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Pharaoh: 'Too many years. Include year 5, not year 4.'" },
    { "when": "wrong_count_low",  "text": "Pharaoh: 'Year 5 itself must be included — check your operator.'" },
    { "when": "default",          "text": "Pharaoh: 'The operator that means greater OR equal is the one you want.'" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "The weight of a decade. Now — the strange small entries."
  }
}
```

- [ ] **Step 5: Puzzle 05 — WHERE with <= (small amounts — Hemiunu surfaces)**

`content/chapters/02-pharaoh/puzzles/05.json`:

```json
{
  "id": "05",
  "concept": "comparison-operators",
  "brief": {
    "speaker": "pharaoh",
    "text": "Any delivery of 500 units or fewer. Such quantities are unusual. Find them. Include 500 itself."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "overseer, year, amount" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "granary" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",  "mode": "dropdown",
      "options": ["amount", "year", "id"] },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": ["<=", "<", "="] },
    { "type": "blank",   "id": "val",  "mode": "dropdown",
      "options": ["500", "50", "5000"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT overseer, year, amount FROM granary WHERE amount <= 500",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Pharaoh: 'Far too many. 500 is the ceiling, not 5000.'" },
    { "when": "wrong_count_low",  "text": "Pharaoh: '500 itself must be included. The operator I want means less OR equal.'" },
    { "when": "default",          "text": "Pharaoh: 'Anything up to and including 500 units.'" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "One entry. One. Hemiunu. Year 9. 420 units of grain. Who is this man?"
  }
}
```

- [ ] **Step 6: Puzzle 06 — WHERE with != (exclude Hemiunu — case closes)**

`content/chapters/02-pharaoh/puzzles/06.json`:

```json
{
  "id": "06",
  "concept": "comparison-operators",
  "brief": {
    "speaker": "pharaoh",
    "text": "Show me every record NOT from this Hemiunu. My remaining scribes are trusted. I want their names on a papyrus for the vizier."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "overseer, year" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "granary" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "overseer" },
    { "type": "blank",   "id": "op",   "mode": "dropdown",
      "options": ["!=", "=", "<"] },
    { "type": "blank",   "id": "val",  "mode": "dropdown",
      "options": ["'Hemiunu'", "'Weni'", "Hemiunu"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT overseer, year FROM granary WHERE overseer != 'Hemiunu'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Pharaoh: 'Hemiunu's entry must be excluded. All 60 rows is too many.'" },
    { "when": "wrong_count_low",  "text": "Pharaoh: 'Too few. You are excluding too much — only Hemiunu goes.'" },
    { "when": "error",            "text": "Pharaoh: 'Text values in quotes. Hemiunu is a name, not a column.'" },
    { "when": "default",          "text": "Pharaoh: 'NOT EQUAL. Filter out only Hemiunu.'" }
  ],
  "success": {
    "speaker": "pharaoh",
    "text": "59 trusted entries. The vizier will speak to Hemiunu himself. Your work has been... illuminating. Go."
  }
}
```

- [ ] **Step 7: Validate**

Run: `npm run validate-content`
Expected: "Content valid: all chapters and puzzles pass." — confirms schema correctness AND that all 6 expected.sql queries execute cleanly against the Chapter 2 seed.

- [ ] **Step 8: Commit**

```bash
git add content/chapters/02-pharaoh/puzzles/
git commit -m "$(cat <<'EOF'
Add Chapter 2 puzzles 01-06 (WHERE + comparison operators)

Progression: text equality, integer equality (Hemiunu surfaces),
greater-than, ≥, ≤ (narrows to Hemiunu's single 420-unit entry),
not-equal (case closes).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Chapter advance + tests + ship

### Task 4: Chapter advance logic in main.js

Currently when a player finishes Chapter 1, `main.js` prints "That was the whole first chapter. More to come." and halts. With Chapter 2 content present, we should instead advance the state to `02-pharaoh / 01` and kick off the next puzzle — same UX as within-chapter Next.

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add CHAPTER_ORDER and next-chapter logic**

Add a module constant near the top of `src/main.js`, after the existing `BOOT_CHAPTER`:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh'];

function nextChapterId(currentId) {
  const idx = CHAPTER_ORDER.indexOf(currentId);
  if (idx === -1) return null;
  return CHAPTER_ORDER[idx + 1] || null;
}
```

- [ ] **Step 2: Replace the "end of chapter" branch in wireNextButton**

Find the else branch in `wireNextButton`:

```js
    } else {
      // End of chapter — outro bubble then a generic "to be continued" for Milestone A.
      pushBubble({ speaker: 'carol', text: chapter.outro });
      pushBubble({ speaker: 'carol', text: 'That was the whole first chapter. More to come.' });
      document.getElementById('puzzle-area').innerHTML = '';
    }
```

Replace with:

```js
    } else {
      pushBubble({ speaker: 'carol', text: chapter.outro });
      const nextCh = nextChapterId(state.currentChapterId);
      if (nextCh) {
        state = setCurrent(state, nextCh, '01');
        saveState(state);
        setChapterForReference(nextCh);
        await runCurrent(state);
      } else {
        pushBubble({ speaker: 'carol', text: 'That was the last chapter we have. More to come.' });
        document.getElementById('puzzle-area').innerHTML = '';
      }
    }
```

- [ ] **Step 3: Manual verify (optional)**

Run `npm start`, clear localStorage in devtools, solve Chapter 1 puzzle 1–5, click Next after each. At the end of puzzle 5, Carol's outro bubble appears, then the UI should automatically load Chapter 2 puzzle 1 — Pharaoh Menkaure's brief should appear.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "$(cat <<'EOF'
Auto-advance to next chapter when the current chapter ends

Previously the Ch1 outro dead-ended. With Ch2 content present we now
flow through to 02-pharaoh / 01 on the final Next click.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Extend Playwright E2E smoke to cover Chapter 2 transition

**Files:**
- Modify: `tests/e2e-smoke.spec.js`

- [ ] **Step 1: Add chapter-transition test**

Append to `tests/e2e-smoke.spec.js`:

```js
test('Chapter 2 loads after Chapter 1 ends', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Plant state so the player starts at Chapter 2, Puzzle 1.
  // (Finishing Ch1 end-to-end via the UI would take 5 puzzles — too slow
  //  for a smoke. We prove Ch2 loads by injecting state + reloading.)
  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '02-pharaoh',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': {
          completed: true,
          solved: ['01', '02', '03', '04', '05'],
          attempts: {},
        },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  // Two bubbles: boss intro + Pharaoh's brief
  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  // Pharaoh's brief mentions "Weni"
  await expect(page.locator('.bubble').last()).toContainText('Weni');

  // Progress indicator shows Chapter 2
  await expect(page.locator('#progress-indicator')).toContainText('Pharaoh');

  // Three dropdowns for col/op/val
  const selects = page.locator('.puzzle-area select');
  await expect(selects).toHaveCount(3);

  // Solve Puzzle 01 canonically
  await selects.nth(0).selectOption('overseer');
  await selects.nth(1).selectOption('=');
  await selects.nth(2).selectOption("'Weni'");
  await page.locator('#run-btn').click();

  // Success
  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});
```

- [ ] **Step 2: Run the smoke**

Run: `npm run test:e2e`
Expected: 3/3 pass (original two + the new chapter-2 test).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e-smoke.spec.js
git commit -m "$(cat <<'EOF'
Extend Playwright smoke to cover Chapter 2 Puzzle 01

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update playtest checklist

**Files:**
- Modify: `docs/playtest-checklist.md`

- [ ] **Step 1: Add Chapter 2 section to playtest checklist**

Append this section to `docs/playtest-checklist.md` (after the "Persistence" section, before the "Security spot-check" section):

```markdown
## Chapter 2 — The Pharaoh's Grain Audit

### Transition
- [ ] After solving Ch1 Puzzle 05, clicking Next shows Carol's outro bubble and the "chapter over" message — no Ch2 yet (Milestone A behavior).
- [ ] Clear localStorage and restart; plant state at Ch2 Puzzle 01 to test Ch2 in isolation, OR solve Ch1 all the way through and observe whether Ch2 auto-advances. (In Milestone B the Ch1 outro still ends the playable flow; Ch2 is reached via direct state or future auto-advance in Milestone D.)

### Puzzle 01 (WHERE with text equality)
- [ ] Pharaoh's brief names Weni.
- [ ] Correct query (`overseer = 'Weni'`) returns ~15 rows. Success.
- [ ] Wrong column (e.g. `silo`) returns 0 rows — wrong_count_low hint.

### Puzzle 02 (WHERE with integer — Hemiunu surfaces)
- [ ] Brief mentions year 9 + "a feeling."
- [ ] Correct query returns 6 rows. Last row overseer is Hemiunu, amount 420.
- [ ] Success text explicitly names Hemiunu for the first time.

### Puzzle 03 (greater-than)
- [ ] `amount > 2000` returns ~28 rows of the big deliveries.
- [ ] `amount > 200` triggers wrong_count_high hint.

### Puzzle 04 (>=)
- [ ] `year >= 5` returns ~40 rows. `year > 5` triggers wrong_count_low hint.

### Puzzle 05 (<=, narrows to Hemiunu)
- [ ] `amount <= 500` returns exactly 1 row: Hemiunu / 9 / 420.
- [ ] `amount < 500` returns 0 rows — wrong_count_low.
- [ ] Success text names Hemiunu again; Menkaure's paranoia peaks.

### Puzzle 06 (!=, case closes)
- [ ] `overseer != 'Hemiunu'` returns 59 rows.
- [ ] Outro stinger: Carol realizes Hemiunu was also on the Ch1 ledger.

## Reference drawer — Chapter 2
- [ ] Drawer shows 5 concepts: SELECT, FROM, LIMIT, WHERE, Comparison ops.
- [ ] Each renders without error.
- [ ] Switching between concepts works; aria-current updates on the selected button.
```

- [ ] **Step 2: Commit**

```bash
git add docs/playtest-checklist.md
git commit -m "$(cat <<'EOF'
Extend playtest checklist with Chapter 2 manual steps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final verification + milestone tag

- [ ] **Step 1: Full test matrix**

```bash
npm test
npm run validate-content
npm run test:e2e
```

Expected:
- `npm test` → 61+ tests passing (Milestone A baseline + no new units since Task 6 in this milestone adds no unit tests)
- `npm run validate-content` → passes with both chapters
- `npm run test:e2e` → 3/3 pass

- [ ] **Step 2: Create milestone-b tag**

```bash
git tag -a milestone-b -m "Milestone B: Chapter 2 playable — WHERE + comparison operators"
```

Do NOT push the tag. The human decides when to publish.

---

## Definition of Done

Milestone B is complete when:

- [ ] All 7 tasks checked off.
- [ ] `npm test` passes.
- [ ] `npm run validate-content` passes (both Ch1 and Ch2 validated).
- [ ] `npm run test:e2e` passes (including the new Ch2 test).
- [ ] `milestone-b` tag created locally.
- [ ] Manual playtest of Chapter 2 through the checklist (can be done in a separate session).

---

## Out of scope for Milestone B (explicit)

- Auto-advance from Ch1 Puzzle 05 Next to Ch2 Puzzle 01 (the outro currently ends the flow — could be added but is deferred to Milestone D or as a tiny separate fixup).
- Chapter selection UI / manual navigation.
- Word-bank renderer (Milestone C).
- Updates to Chapter 1 content (done).
- New DuckDB features or security changes.
