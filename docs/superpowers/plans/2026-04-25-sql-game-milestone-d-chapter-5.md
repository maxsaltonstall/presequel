# Chapter 5 Implementation Plan — Oldrich's Repeat Customers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chapter 5 of the SQL learning game — six puzzles teaching `DISTINCT`, `HAVING`, and date/time functions, set in 1347 Prague, ending with the player finding Hemiunu via a weekly-visit pattern. Adds a new "typing" mechanic mode (free-text inputs in the existing template-blank scaffolding).

**Architecture:** Additive engine change — a third blank-rendering mode (`typing`) alongside the existing `dropdown` and `word_bank`. SQL assembly, hint selection, and row comparison are unchanged. Content lives under `sqllearning/content/chapters/05-tavern/` matching the existing chapter directory pattern. Seed data is produced by a deterministic generator script (no PRNG, hand-authored patterns) similar to the Chapter 4 census generator.

**Tech Stack:** Vanilla JS ES modules in browser, Node 22 server, DuckDB via `@duckdb/node-api`, `node --test` for unit tests, Playwright for E2E smoke. No new dependencies.

**Spec reference:** `sqllearning/docs/superpowers/specs/2026-04-25-chapter-5-oldrich-design.md`

---

## File map

**Create:**
- `sqllearning/content/chapters/05-tavern/chapter.json` — chapter metadata
- `sqllearning/content/chapters/05-tavern/seed.sql` — generated seed (output of generator)
- `sqllearning/content/chapters/05-tavern/puzzles/01.json` through `06.json` — six puzzles
- `sqllearning/content/reference/distinct.md` — DISTINCT reference
- `sqllearning/content/reference/having.md` — HAVING reference
- `sqllearning/content/reference/date-functions.md` — DATE_TRUNC + EXTRACT reference
- `sqllearning/scripts/generate-tavern-seed.js` — deterministic seed generator

**Modify:**
- `sqllearning/src/puzzle.js` — add `renderTemplateTyping` + dispatch branch
- `sqllearning/src/dialogue.js` — add `oldrich` to SPEAKERS
- `sqllearning/src/main.js` — append `'05-tavern'` to CHAPTER_ORDER
- `sqllearning/src/reference.js` — add `'05-tavern'` to CONCEPTS_FOR_CHAPTER
- `sqllearning/tests/sql-assembly.test.js` — add typed-blank assembly tests
- `sqllearning/tests/e2e-smoke.spec.js` — add Chapter 5 Puzzle 01 walkthrough
- `sqllearning/docs/playtest-checklist.md` — append Chapter 5 section

---

## Task 1: Verify SQL assembly works for typed-blank inputs

The existing `assembleSql` function in `puzzle.js` is mode-agnostic — it reads `blanks[tok.id]` regardless of how the value got there. We're adding tests to lock in this behavior for typed inputs (multi-token strings, function calls with parentheses) so future changes can't silently break it.

**Files:**
- Modify: `sqllearning/tests/sql-assembly.test.js`

- [ ] **Step 1: Add typed-blank tests at the end of the file**

```js
test('typed blank with a function call value', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank',   id: 'col', mode: 'typed' },
    { type: 'keyword', text: 'FROM' },
    { type: 'text',    text: 'visits' },
  ];
  const blanks = { col: 'COUNT(DISTINCT patron_id)' };
  assert.equal(
    assembleSql(tmpl, blanks),
    'SELECT COUNT(DISTINCT patron_id) FROM visits',
  );
});

test('typed blank with extract expression', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank',   id: 'expr', mode: 'typed' },
    { type: 'text',    text: 'AS month' },
    { type: 'keyword', text: 'FROM' },
    { type: 'text',    text: 'visits' },
  ];
  const blanks = { expr: 'EXTRACT(MONTH FROM visit_date)' };
  assert.equal(
    assembleSql(tmpl, blanks),
    'SELECT EXTRACT(MONTH FROM visit_date) AS month FROM visits',
  );
});

test('typed blank trims interior multi-whitespace from typed value', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank',   id: 'col', mode: 'typed' },
    { type: 'keyword', text: 'FROM' },
    { type: 'text',    text: 't' },
  ];
  const blanks = { col: 'COUNT(*)   AS   n' };
  assert.equal(
    assembleSql(tmpl, blanks),
    'SELECT COUNT(*) AS n FROM t',
  );
});
```

- [ ] **Step 2: Run tests, verify all pass (assembleSql already supports this)**

Run: `cd sqllearning && node --test tests/sql-assembly.test.js`
Expected: all tests pass, including the three new ones. If any fail, the existing assembleSql has a bug that needs fixing before continuing.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add tests/sql-assembly.test.js
git commit -m "test: cover typed-blank scenarios in sql assembly"
```

---

## Task 2: Add `renderTemplateTyping` to the puzzle renderer

Adds a third rendering branch for `mechanic_mode === 'typing'`. Mirrors the dropdown renderer but emits `<input type="text">` for each blank.

**Files:**
- Modify: `sqllearning/src/puzzle.js`

- [ ] **Step 1: Add the typing renderer function**

Insert this function in `sqllearning/src/puzzle.js` immediately above `function spanToken(...)` (line ~216):

```js
function renderTemplateTyping(template, blanks, onInput) {
  const area = document.getElementById('puzzle-area');
  area.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'puzzle-header';
  header.textContent = area.dataset.header || '';
  area.appendChild(header);

  const query = document.createElement('div');
  query.className = 'query';
  for (const tok of template) {
    if (tok.type === 'keyword') {
      query.appendChild(spanToken('keyword', tok.text + ' '));
    } else if (tok.type === 'text') {
      query.appendChild(spanToken('text', tok.text + ' '));
    } else if (tok.type === 'blank') {
      const span = document.createElement('span');
      span.className = 'blank';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'typed-input';
      input.dataset.slot = tok.id;
      input.placeholder = tok.placeholder || 'type here';
      input.value = blanks[tok.id] || '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.addEventListener('input', () => onInput(tok.id, input.value));
      span.appendChild(input);
      query.appendChild(span);
      query.appendChild(document.createTextNode(' '));
    }
  }
  area.appendChild(query);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'run-btn';
  runBtn.id = 'run-btn';
  runBtn.textContent = 'Run query';
  area.appendChild(runBtn);

  return runBtn;
}
```

- [ ] **Step 2: Add the `typing` dispatch branch in `playPuzzle`'s `rerender`**

In `sqllearning/src/puzzle.js`, find the `rerender()` function inside `playPuzzle` (around line 289). Replace the `else` branch (currently the dropdown fallback) with an explicit `else if` for `dropdown` and add a new branch for `typing`:

```js
function rerender() {
  if (mechanicMode === 'word_bank') {
    runBtn = renderTemplateWordBank(puzzle.template, { blanks, bank },
      (slotId) => {
        if (busy || solved) return;
        const r = returnSlotToBank(puzzle.template, blanks, bank, slotId);
        blanks = r.blanks; bank = r.bank;
        rerender();
      },
      (bankIdx) => {
        if (busy || solved) return;
        const token = bank[bankIdx];
        const r = fillFirstEmptySlot(puzzle.template, blanks, bank, token);
        blanks = r.blanks; bank = r.bank;
        rerender();
      },
    );
  } else if (mechanicMode === 'typing') {
    runBtn = renderTemplateTyping(puzzle.template, blanks, (id, val) => {
      blanks[id] = val;
      runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
    });
  } else {
    runBtn = renderTemplateDropdown(puzzle.template, blanks, (id, val) => {
      blanks[id] = val;
      runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
    });
  }
  runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
  runBtn.addEventListener('click', handleSubmit);
}
```

- [ ] **Step 3: Add minimal CSS for typed inputs**

Find `sqllearning/style.css`. Append a block for the typing input. Match the visual style of the existing `.slot.filled` (background, border, padding) so typing mode feels consistent with word-bank slots:

```css
.typed-input {
  font-family: inherit;
  font-size: inherit;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  padding: 2px 6px;
  min-width: 4ch;
  width: auto;
}
.typed-input:focus {
  outline: 1px solid rgba(255, 200, 100, 0.6);
  background: rgba(255, 255, 255, 0.08);
}
```

If the existing CSS uses different conventions (different selectors for focus, different palette), match those conventions instead. Read the existing file before adding.

- [ ] **Step 4: Run all unit tests to confirm nothing else broke**

Run: `cd sqllearning && npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd sqllearning
git add src/puzzle.js style.css
git commit -m "feat(engine): add typed-blank rendering mode for mechanic_mode='typing'"
```

---

## Task 3: Add Oldrich to the SPEAKERS table

**Files:**
- Modify: `sqllearning/src/dialogue.js`

- [ ] **Step 1: Add the Oldrich entry**

In `sqllearning/src/dialogue.js`, edit the `SPEAKERS` object (lines 1-8) to include Oldrich:

```js
const SPEAKERS = {
  carol:   { label: 'Carol', role: 'boss' },
  client:  { label: 'Client', role: 'client' },
  pharaoh: { label: 'Pharaoh Menkaure', role: 'client' },
  gladys:  { label: 'Gladys Vance', role: 'client' },
  grayson: { label: 'Cornelius Grayson', role: 'client' },
  oldrich: { label: 'Oldrich', role: 'client' },
};
```

- [ ] **Step 2: Run all tests to confirm nothing broke**

Run: `cd sqllearning && npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add src/dialogue.js
git commit -m "feat: add Oldrich to SPEAKERS"
```

---

## Task 4: Reference markdown — DISTINCT

**Files:**
- Create: `sqllearning/content/reference/distinct.md`

- [ ] **Step 1: Write the file**

Create `sqllearning/content/reference/distinct.md` with this exact content:

```markdown
# DISTINCT

`DISTINCT` removes duplicate rows from a result set. It applies to the entire row produced by the SELECT list, not to a single column.

## Forms

```sql
-- Unique values of one column:
SELECT DISTINCT occupation FROM patrons;

-- Unique combinations across multiple columns:
SELECT DISTINCT name, home_village FROM patrons;

-- Inside an aggregate, count only unique values:
SELECT COUNT(DISTINCT patron_id) FROM visits;
```

## Notes

- `DISTINCT` looks at every column in the SELECT list. `SELECT DISTINCT name, age` and `SELECT DISTINCT name` are different — the first keeps a row for each (name, age) pair.
- `COUNT(DISTINCT col)` is by far the most common shape in real queries — counting unique customers, unique sessions, unique error codes, etc.
- `DISTINCT` is computed after `WHERE` but before `ORDER BY` and `LIMIT`.
```

- [ ] **Step 2: Verify the file loads via the reference drawer**

Manual: start the server (`npm start`), open the reference drawer, navigate to a chapter that includes "distinct" — there isn't one yet, so this step verifies later. For now, confirm the file exists and is readable:

Run: `cat sqllearning/content/reference/distinct.md | head -3`
Expected: shows the `# DISTINCT` heading.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/reference/distinct.md
git commit -m "docs(reference): add DISTINCT reference markdown"
```

---

## Task 5: Reference markdown — HAVING

**Files:**
- Create: `sqllearning/content/reference/having.md`

- [ ] **Step 1: Write the file**

Create `sqllearning/content/reference/having.md` with this exact content:

```markdown
# HAVING

`HAVING` filters groups produced by `GROUP BY`. Where `WHERE` filters individual rows before grouping, `HAVING` filters aggregated results after.

## Form

```sql
SELECT patron_id, COUNT(*) AS visits
FROM visits
GROUP BY patron_id
HAVING COUNT(*) >= 20;
```

## Notes

- `WHERE` happens first (per-row), then `GROUP BY`, then `HAVING` (per-group), then `SELECT`, then `ORDER BY`, then `LIMIT`.
- The expression in `HAVING` typically references an aggregate (`COUNT(*)`, `SUM(amount)`, `AVG(price)`, etc.) or a column listed in the `GROUP BY`. Anything else won't make sense.
- A common confusion: trying to filter aggregates with `WHERE`. `WHERE COUNT(*) > 5` is an error — at the moment `WHERE` runs, no count exists yet. Use `HAVING` for that.
- You can use a column alias from the SELECT list in `HAVING` in some SQL dialects, but not all. Safe to repeat the aggregate expression: `HAVING COUNT(*) >= 20` instead of `HAVING visits >= 20`.
```

- [ ] **Step 2: Verify the file is readable**

Run: `cat sqllearning/content/reference/having.md | head -3`
Expected: shows the `# HAVING` heading.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/reference/having.md
git commit -m "docs(reference): add HAVING reference markdown"
```

---

## Task 6: Reference markdown — date functions

**Files:**
- Create: `sqllearning/content/reference/date-functions.md`

- [ ] **Step 1: Write the file**

Create `sqllearning/content/reference/date-functions.md` with this exact content:

```markdown
# Date functions

DuckDB ships with rich date and time functions. Two are introduced here.

## EXTRACT — pull a piece out of a date

```sql
EXTRACT(YEAR  FROM visit_date)   -- 1347
EXTRACT(MONTH FROM visit_date)   -- 1..12
EXTRACT(DAY   FROM visit_date)   -- 1..31
EXTRACT(DOW   FROM visit_date)   -- day of week, 0=Sunday
```

Use it when you want to group or filter by a piece of a date — "visits per month", "all entries on Wednesdays", etc.

## DATE_TRUNC — round a date down to a unit

```sql
DATE_TRUNC('week',  visit_date)   -- Monday of that week (DuckDB's default)
DATE_TRUNC('month', visit_date)   -- first of the month
DATE_TRUNC('year',  visit_date)   -- January 1 of the year
```

Use it when you want to bucket dates into time windows — "visits per week", "revenue per month". The result is itself a date, so you can `GROUP BY` it directly.

## EXTRACT vs DATE_TRUNC

```sql
EXTRACT(MONTH FROM '2025-04-15')   -- returns 4 (an integer)
DATE_TRUNC('month', '2025-04-15')  -- returns 2025-04-01 (a date)
```

`EXTRACT` strips the date down to one number. `DATE_TRUNC` keeps it as a date but rounds it. Pick by what you want to do with the result.
```

- [ ] **Step 2: Verify the file is readable**

Run: `cat sqllearning/content/reference/date-functions.md | head -3`
Expected: shows the `# Date functions` heading.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/reference/date-functions.md
git commit -m "docs(reference): add date-functions reference markdown"
```

---

## Task 7: Tavern seed data generator

The generator produces a deterministic `seed.sql` with two tables and ~540 rows. No randomness — every patron has a hand-authored visit pattern that hits the spec's row-count and Hemiunu-uniqueness invariants. Re-running the script must produce byte-identical output.

**Files:**
- Create: `sqllearning/scripts/generate-tavern-seed.js`
- Output: `sqllearning/content/chapters/05-tavern/seed.sql`

- [ ] **Step 1: Create the directory for chapter 5 content**

Run: `mkdir -p sqllearning/content/chapters/05-tavern/puzzles`
Expected: silent success.

- [ ] **Step 2: Write the generator**

Create `sqllearning/scripts/generate-tavern-seed.js`:

```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deterministic generator — no randomness, no env reads.
// Re-running produces byte-identical seed.sql.

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'content', 'chapters', '05-tavern', 'seed.sql');

const PATRONS = [
  // [id, name, occupation, home_village]
  [ 1, "Pavel the Blacksmith",     "blacksmith",      "Žižkov"],
  [ 2, "Mireska the Weaver",       "weaver",          "Stare Mesto"],
  [ 3, "Father Ondřej",            "priest",          "Mala Strana"],
  [ 4, "Zdeněk the Cartwright",    "cartwright",      "Vyšehrad"],
  [ 5, "Vlastimila the Midwife",   "midwife",         "Žižkov"],
  [ 6, "Tomáš the Cooper",         "cooper",          "Stare Mesto"],
  [ 7, "Hanuš the Tanner",         "tanner",          "Holešovice"],
  [ 8, "Jitka the Baker",          "baker",           "Mala Strana"],
  [ 9, "Radek the Drover",         "drover",          "Vinohrady"],
  [10, "Brona the Herbwoman",      "herbalist",       "Vyšehrad"],
  [11, "Vít the Charcoal-burner",  "charcoal-burner", "Karlin"],
  [12, "Zora the Spinner",         "spinner",         "Žižkov"],
  [13, "Dušan the Fletcher",       "fletcher",        "Stare Mesto"],
  [14, "Lenka the Wheelwright",    "wheelwright",     "Vinohrady"],
  [15, "Bohuslav the Mason",       "mason",           "Mala Strana"],
  [16, "Růžena the Laundress",     "laundress",       "Holešovice"],
  [17, "Mireska the Younger",      "weaver",          "Stare Mesto"], // unrelated to #2
  [18, "Štěpán the Salt-trader",   "merchant",        "Karlin"],
  [19, "Kamil the Wool-trader",    "merchant",        "Karlin"],
  [20, "Otakar the Cloth-trader",  "merchant",        "Karlin"],
  [21, "Berta the Goosegirl",      "goosegirl",       "Žižkov"],
  [22, "Jaromír the Carpenter",    "carpenter",       "Vyšehrad"],
  [23, "Eliška the Brewer's wife", "alewife",         "Mala Strana"],
  [24, "Vladislav the Notary",     "notary",          "Stare Mesto"],
  [25, "Anežka the Goodwife",      "goodwife",        "Vinohrady"],
  [26, "Bedřich the Stonecutter",  "stonecutter",     "Mala Strana"],
  [27, "Cestmír the Reeve",        "reeve",           "Holešovice"],
  [28, "Drahoslava the Huntress",  "huntress",        "Vyšehrad"],
  [29, "Emil the Tilemaker",       "tilemaker",       "Karlin"],
  [30, "Hemiunu",                  "traveler",        null],            // <-- the plant
  [31, "Filip the Watchman",       "watchman",        "Stare Mesto"],
  [32, "Gabriela the Glazier",     "glazier",         "Mala Strana"],
  [33, "Hynek the Furrier",        "furrier",         "Žižkov"],
  [34, "Ivana the Seamstress",     "seamstress",      "Vinohrady"],
  [35, "Jindřich the Shoemaker",   "shoemaker",       "Stare Mesto"],
  [36, "Květa the Net-mender",     "net-mender",      "Holešovice"],
  [37, "Lubomír the Saddler",      "saddler",         "Karlin"],
  [38, "Marta the Egg-seller",     "egg-seller",      "Vinohrady"],
  [39, "Norbert the Cooper",       "cooper",          "Mala Strana"],
  [40, "Oldřiška the Innkeeper",   "innkeeper",       "Stare Mesto"],
];

// === Date helpers ===
function isoDate(y, m, d) {
  // m is 1-indexed; returns 'YYYY-MM-DD'
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(dateStr) {
  // 0=Sunday, 3=Wednesday
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function eachDateOfWeekday(year, weekday) {
  // All dates in the given year that fall on the given weekday (0..6).
  const out = [];
  let cur = isoDate(year, 1, 1);
  // advance to first matching weekday
  while (dayOfWeek(cur) !== weekday) cur = addDays(cur, 1);
  while (cur.startsWith(String(year))) {
    out.push(cur);
    cur = addDays(cur, 7);
  }
  return out;
}

function datesInRange(startStr, endStr) {
  const out = [];
  let cur = startStr;
  while (cur <= endStr) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

// === Visit generation ===
const visits = [];
let nextVisitId = 1;
function add(patronId, dateStr, tab) {
  visits.push({ visit_id: nextVisitId++, patron_id: patronId, visit_date: dateStr, tab_groschen: tab });
}

// HEMIUNU (id 30): every Wednesday of 1347, tab=1, exactly 52 visits.
for (const d of eachDateOfWeekday(1347, 3)) add(30, d, 1);

// PAVEL (id 1): heavy regular, ~80 visits Mar-Jun, sustained drinking.
// Tuesday/Thursday/Saturday across 4 months ≈ 13 weeks * 6 days = ~78 visits.
const pavelDays = [2, 4, 6]; // Tue, Thu, Sat
for (const d of datesInRange('1347-03-01', '1347-06-30')) {
  if (pavelDays.includes(dayOfWeek(d))) add(1, d, 4 + (visits.length % 3));
}

// MIRESKA (id 2): ~30 Sunday visits across the year (most Sundays Jan-Aug).
const sundays1347 = eachDateOfWeekday(1347, 0); // 52 Sundays
for (const d of sundays1347.slice(0, 30)) add(2, d, 2);

// FATHER ONDŘEJ (id 3): visits clustered around Christian feast days. ~25 visits.
const feastDays1347 = [
  '1347-01-06', '1347-02-02', '1347-03-25', '1347-04-08', '1347-04-09',
  '1347-05-17', '1347-05-27', '1347-06-24', '1347-06-29', '1347-07-22',
  '1347-08-15', '1347-09-08', '1347-09-14', '1347-09-29', '1347-10-04',
  '1347-11-01', '1347-11-02', '1347-11-11', '1347-11-30', '1347-12-06',
  '1347-12-08', '1347-12-25', '1347-12-26', '1347-12-27', '1347-12-31',
];
for (const d of feastDays1347) add(3, d, 2);

// MARKET-DAY MERCHANTS (ids 18, 19, 20): trade-season Fridays only,
// thinned so each comes <20 times — they're traders, not regulars.
const tradingFridays = eachDateOfWeekday(1347, 5).filter(d => d >= '1347-04-01' && d <= '1347-10-31');
for (let i = 0; i < tradingFridays.length; i += 2) add(18, tradingFridays[i], 3); // ~15 visits
for (let i = 0; i < tradingFridays.length; i += 3) add(19, tradingFridays[i], 3); // ~10 visits
for (let i = 0; i < tradingFridays.length; i += 4) add(20, tradingFridays[i], 3); // ~7  visits

// REGULARS (ids 4, 5, 6): exactly three, each just over 20 visits.
// Combined with Pavel, Mireska, and Father Ondřej, this yields exactly six
// patrons with >=20 visits — the count Oldrich names in puzzle 04.
const saturdays = eachDateOfWeekday(1347, 6);
const fridayList = eachDateOfWeekday(1347, 5);
const weekendish = [...saturdays, ...sundays1347].sort();

const REGULARS = [
  { id: 4, days: weekendish.slice(0, 22), tab: 3 }, // Zdeněk:    22 visits
  { id: 5, days: fridayList.slice(0, 21), tab: 2 }, // Vlastimila: 21 visits
  { id: 6, days: saturdays.slice(0, 20),  tab: 5 }, // Tomáš:     20 visits
];
for (const reg of REGULARS) {
  for (const d of reg.days) add(reg.id, d, reg.tab);
}

// CASUALS (everyone else): 1-15 visits, scattered. Hand-tuned to hit ~500 total.
// Generated deterministically: each patron visits a small set of evenly-spaced dates.
const CASUAL_IDS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29,
                   31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
let casualSeed = 7;
for (const pid of CASUAL_IDS) {
  // count varies 3..14 deterministically per patron id
  const count = 3 + ((pid * 13) % 12);
  // pick `count` dates evenly across days 10..360 of the year
  for (let i = 0; i < count; i++) {
    const dayOfYear = 10 + Math.floor((i * 350) / count) + (pid % 7);
    const dateStr = addDays('1347-01-01', dayOfYear - 1);
    if (dateStr <= '1347-12-31') add(pid, dateStr, 1 + ((pid + i) % 5));
  }
  casualSeed += 1;
}

// PLAGUE FLAVOR: thin out non-Hemiunu visits in Oct-Dec.
// Drop ~half of the late-year visits, but spare Hemiunu and Father Ondřej —
// the priest's tavern visits *increase* during plague (frightened believers
// seeking him out). Both keep their full counts; everyone else thins.
const before = visits.length;
const filtered = visits.filter((v, idx) => {
  if (v.patron_id === 30) return true;             // Hemiunu — never misses
  if (v.patron_id === 3) return true;              // Father Ondřej — plague brings believers
  if (v.visit_date < '1347-10-01') return true;    // pre-plague stays
  return idx % 2 === 0;                            // half the late-year visits drop
});
visits.length = 0;
visits.push(...filtered);
// Re-number visit_ids so they're contiguous after filtering.
for (let i = 0; i < visits.length; i++) visits[i].visit_id = i + 1;

console.log(`Generated ${PATRONS.length} patrons, ${visits.length} visits ` +
            `(plague flavor dropped ${before - visits.length}).`);

// === Sanity checks (fail loudly if invariants break) ===
const visitsByPatron = new Map();
for (const v of visits) {
  if (!visitsByPatron.has(v.patron_id)) visitsByPatron.set(v.patron_id, []);
  visitsByPatron.get(v.patron_id).push(v);
}

function distinctWeeks(visitList) {
  const weeks = new Set();
  for (const v of visitList) {
    const monday = addDays(v.visit_date, -((dayOfWeek(v.visit_date) + 6) % 7));
    weeks.add(monday);
  }
  return weeks.size;
}

const hemiunuVisits = visitsByPatron.get(30) || [];
if (hemiunuVisits.length !== 52) {
  throw new Error(`Hemiunu must have 52 visits, got ${hemiunuVisits.length}`);
}
if (distinctWeeks(hemiunuVisits) < 50) {
  throw new Error(`Hemiunu must span ≥50 weeks, got ${distinctWeeks(hemiunuVisits)}`);
}
let othersOver50 = 0;
for (const [pid, vs] of visitsByPatron.entries()) {
  if (pid === 30) continue;
  if (distinctWeeks(vs) >= 50) othersOver50++;
}
if (othersOver50 > 0) {
  throw new Error(`Only Hemiunu may span ≥50 weeks; found ${othersOver50} other patrons`);
}
const regularsCount = [...visitsByPatron.values()].filter(vs => vs.length >= 20).length;
if (regularsCount !== 6) {
  throw new Error(`Puzzle 04 expects exactly 6 patrons with ≥20 visits; got ${regularsCount}`);
}

// === Emit SQL ===
function sqlString(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

const lines = [];
lines.push('-- Chapter 5 seed: Oldrich the Tavern Keeper, Prague 1347.');
lines.push('-- Generated by scripts/generate-tavern-seed.js — do not edit by hand.');
lines.push('');
lines.push('CREATE TABLE patrons (');
lines.push('  patron_id     INT PRIMARY KEY,');
lines.push('  name          TEXT NOT NULL,');
lines.push('  occupation    TEXT NOT NULL,');
lines.push('  home_village  TEXT');
lines.push(');');
lines.push('');
lines.push('INSERT INTO patrons VALUES');
const patronRows = PATRONS.map(([id, name, occ, vill]) =>
  `  (${id}, ${sqlString(name)}, ${sqlString(occ)}, ${sqlString(vill)})`
);
lines.push(patronRows.join(',\n') + ';');
lines.push('');
lines.push('CREATE TABLE visits (');
lines.push('  visit_id       INT PRIMARY KEY,');
lines.push('  patron_id      INT NOT NULL,');
lines.push('  visit_date     DATE NOT NULL,');
lines.push('  tab_groschen   INT NOT NULL');
lines.push(');');
lines.push('');
lines.push('INSERT INTO visits VALUES');
const visitRows = visits.map(v =>
  `  (${v.visit_id}, ${v.patron_id}, ${sqlString(v.visit_date)}, ${v.tab_groschen})`
);
lines.push(visitRows.join(',\n') + ';');
lines.push('');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`Wrote ${OUT_PATH}`);
```

- [ ] **Step 3: Run the generator**

Run: `cd sqllearning && node scripts/generate-tavern-seed.js`
Expected output:
- Console line: `Generated 40 patrons, ~XXX visits (plague flavor dropped YY).`
- Console line: `Wrote .../content/chapters/05-tavern/seed.sql`
- File exists at `sqllearning/content/chapters/05-tavern/seed.sql`
- No "Hemiunu must…" or "Expected 6-7 patrons…" error.

If the regulars-count or week-uniqueness invariants fail, the hand-tuned distraction patrons need adjustment in the generator. Tweak the `REGULARS` array or `CASUAL_IDS` counts and re-run.

- [ ] **Step 4: Verify the seed loads and has the expected structure**

Run a quick DuckDB sanity check:

```bash
cd sqllearning && node -e "
import('@duckdb/node-api').then(async ({ DuckDBInstance }) => {
  const inst = await DuckDBInstance.create(':memory:');
  const conn = await inst.connect();
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync('content/chapters/05-tavern/seed.sql', 'utf8');
  const ex = await conn.extractStatements(sql);
  for (let i = 0; i < ex.count; i++) {
    const p = await ex.prepare(i);
    await p.run();
  }
  const r1 = await conn.run('SELECT COUNT(*) FROM patrons');
  const r2 = await conn.run('SELECT COUNT(*) FROM visits');
  console.log('patrons:', (await r1.getRows())[0][0]);
  console.log('visits:', (await r2.getRows())[0][0]);
  const r3 = await conn.run(\"SELECT patron_id FROM visits WHERE patron_id = 30 GROUP BY patron_id HAVING COUNT(DISTINCT DATE_TRUNC('week', visit_date)) >= 50\");
  console.log('hemiunu rows ≥50 weeks:', (await r3.getRows()).length);
});
"
```

Expected:
```
patrons: 40
visits: <some number, ~430-490 after plague drop>
hemiunu rows ≥50 weeks: 1
```

- [ ] **Step 5: Commit**

```bash
cd sqllearning
git add scripts/generate-tavern-seed.js content/chapters/05-tavern/seed.sql
git commit -m "feat(content): add Chapter 5 tavern seed generator and seed.sql"
```

---

## Task 8: Chapter 5 metadata (chapter.json)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/chapter.json`

- [ ] **Step 1: Write chapter.json**

Create `sqllearning/content/chapters/05-tavern/chapter.json` with this exact content:

```json
{
  "id": "05-tavern",
  "ordinal": 5,
  "title": "Oldrich's Repeat Customers",
  "era": "Prague, 1347",
  "client": {
    "name": "Oldrich",
    "portrait": "oldrich.svg",
    "voice": "flinty, observant, plague-shadowed"
  },
  "boss_intro": "Carol drops a sealed scroll on the desk. 'Bohemia. 1347. Tavern keeper named Oldrich. He thinks his books don't match his memory.' She pauses. 'Worth noting — he doesn't keep his books the way the others did. No forms with neat little boxes. Parchment and a candle and a man who can read. You're going to have to write the queries yourself this time.' She turns to leave, then stops at the doorway. 'He's also asked us to hurry. There's plague in the south. He doesn't know how long he'll have customers.'",
  "concepts_introduced": ["distinct", "having", "date-functions"],
  "concepts_reviewed": ["count", "group-by", "where"],
  "mechanic_mode": "typing",
  "arc_hook": "Oldrich's most regular customer comes every Wednesday. Same drink. Same five minutes. He hasn't aged in a year of pours. The patron register has a name with no surname and no village.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "Back at Chrono Consulting. Carol reads your working papers, the patron register entry pinned to the top. She doesn't say anything for a while. Then she lays four pages on her desk, side by side. Old Kingdom Egypt. 1920s Chicago. 1890 New York. 1347 Prague. Hemiunu in every one. 'The CEO didn't return my call last week. He won't this week either.' She picks up the phone anyway. 'Pull every chapter's ledger from records. All of them. We're going to put them on the same page.' She hangs up. 'Hope you've been thinking about how to read more than one table at a time.'"
}
```

- [ ] **Step 2: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/chapter.json
git commit -m "feat(content): add Chapter 5 metadata"
```

---

## Task 9: Puzzle 01 — "Open the books" (basic SELECT refresher)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/puzzles/01.json`

- [ ] **Step 1: Write the puzzle**

Create `sqllearning/content/chapters/05-tavern/puzzles/01.json`:

```json
{
  "id": "01",
  "concept": "select",
  "brief": {
    "speaker": "oldrich",
    "text": "Every pour. Every coin. A year of it. Look at the book before you ask me anything."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "cols", "mode": "typed", "placeholder": "columns to show" },
    { "type": "keyword", "text": "FROM" },
    { "type": "blank",   "id": "tbl",  "mode": "typed", "placeholder": "table name" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "text",    "text": "10" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT visit_id, patron_id, visit_date, tab_groschen FROM visits LIMIT 10",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Oldrich grunts. 'I asked for ten lines, not the whole year.'" },
    { "when": "wrong_count_low",  "text": "Oldrich frowns. 'Not enough. Show me ten.'" },
    { "when": "error",            "text": "Oldrich peers over your shoulder. 'You wrote that wrong. Try again. The table is called *visits*.'" },
    { "when": "default",          "text": "Oldrich: 'Pick the columns you want, name the table, ten rows. That's all I asked.'" }
  ],
  "success": {
    "speaker": "oldrich",
    "text": "Oldrich grunts. 'Now you've seen it. Ask me what you want.'"
  }
}
```

- [ ] **Step 2: Run the content validator**

Run: `cd sqllearning && npm run validate-content`
Expected: validator runs the puzzle's expected SQL against the chapter seed and reports success. The validator uses `${CONTENT_ROOT}` substitution so it will resolve the seed correctly.

If the validator complains about a missing reference concept, that's wired up in Task 16.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/puzzles/01.json
git commit -m "feat(chapter-5): add puzzle 01 — open the books"
```

---

## Task 10: Puzzle 02 — "How many faces?" (DISTINCT)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/puzzles/02.json`

- [ ] **Step 1: Write the puzzle**

```json
{
  "id": "02",
  "concept": "distinct",
  "brief": {
    "speaker": "oldrich",
    "text": "How many different mouths have I served this year? Not how many cups — how many people. I am not a charity."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "expr", "mode": "typed", "placeholder": "count distinct patrons" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "visits" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT COUNT(DISTINCT patron_id) FROM visits",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Oldrich: 'You're counting cups, not faces. Use DISTINCT.'" },
    { "when": "error",            "text": "Oldrich: 'You wrote it wrong. The shape is COUNT — open paren — DISTINCT — column — close paren.'" },
    { "when": "default",          "text": "Oldrich: 'Count distinct patrons. Just one number.'" }
  ],
  "success": {
    "speaker": "oldrich",
    "text": "Oldrich nods slowly. 'More than I thought. Some I'd have to think hard to picture.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd sqllearning && npm run validate-content`
Expected: passes. The expected SQL returns one row, one column, value = number of unique patron_ids in `visits` (around 38-40 since not every patron necessarily has a visit).

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/puzzles/02.json
git commit -m "feat(chapter-5): add puzzle 02 — DISTINCT"
```

---

## Task 11: Puzzle 03 — "Who comes most?" (COUNT + GROUP BY refresher)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/puzzles/03.json`

- [ ] **Step 1: Write the puzzle**

```json
{
  "id": "03",
  "concept": "group-by",
  "brief": {
    "speaker": "oldrich",
    "text": "Who do I see the most of? I'd like to know who I owe a cup to. Or who I should be charging more."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "patron_id," },
    { "type": "blank",   "id": "agg", "mode": "typed", "placeholder": "count of visits" },
    { "type": "text",    "text": "AS visits" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "visits" },
    { "type": "keyword", "text": "GROUP BY" },
    { "type": "blank",   "id": "grp", "mode": "typed", "placeholder": "what to group by" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "text",    "text": "visits DESC" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "text",    "text": "5" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT patron_id, COUNT(*) AS visits FROM visits GROUP BY patron_id ORDER BY visits DESC LIMIT 5",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Oldrich: 'Top five only. I don't need the whole list.'" },
    { "when": "error",            "text": "Oldrich: 'GROUP BY needs the same column you're not aggregating. patron_id, in this case.'" },
    { "when": "default",          "text": "Oldrich: 'Count visits per patron. Top five, most visits first.'" }
  ],
  "success": {
    "speaker": "oldrich",
    "text": "Oldrich nods. 'Pavel. Sounds right. He's been miserable since his wife died — drinks like a fish, leaves like a ghost.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd sqllearning && npm run validate-content`
Expected: passes. Pavel (id 1) is the top-ranked patron by visit count.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/puzzles/03.json
git commit -m "feat(chapter-5): add puzzle 03 — COUNT + GROUP BY refresher"
```

---

## Task 12: Puzzle 04 — "Just the regulars" (HAVING)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/puzzles/04.json`

- [ ] **Step 1: Write the puzzle**

```json
{
  "id": "04",
  "concept": "having",
  "brief": {
    "speaker": "oldrich",
    "text": "Just the ones I'd call regulars. Twenty visits or more. Less than that, they're strangers to me."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "patron_id, COUNT(*) AS visits" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "visits" },
    { "type": "keyword", "text": "GROUP BY" },
    { "type": "text",    "text": "patron_id" },
    { "type": "keyword", "text": "HAVING" },
    { "type": "blank",   "id": "cond", "mode": "typed", "placeholder": "condition on the count" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT patron_id, COUNT(*) AS visits FROM visits GROUP BY patron_id HAVING COUNT(*) >= 20",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Oldrich: 'Too many. The cutoff is twenty visits. Strict less than that, they're not regulars.'" },
    { "when": "wrong_count_low",  "text": "Oldrich: 'You've cut it too narrow. Twenty *or more*. Include twenty itself.'" },
    { "when": "error",            "text": "Oldrich: 'HAVING needs an aggregate condition. COUNT(*) compared to a number.'" },
    { "when": "default",          "text": "Oldrich: 'Filter the groups, not the rows. HAVING — not WHERE — for things you've counted.'" }
  ],
  "success": {
    "speaker": "oldrich",
    "text": "Oldrich looks at the list. 'Six. Yes. Six faces I'd recognize at the well in the morning.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd sqllearning && npm run validate-content`
Expected: passes. Result is exactly 6 rows (the six "regulars" hand-tuned in the seed).

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/puzzles/04.json
git commit -m "feat(chapter-5): add puzzle 04 — HAVING"
```

---

## Task 13: Puzzle 05 — "Mireska's rhythm" (date function)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/puzzles/05.json`

- [ ] **Step 1: Write the puzzle**

```json
{
  "id": "05",
  "concept": "date-functions",
  "brief": {
    "speaker": "oldrich",
    "text": "Mireska — patron 2, the weaver — comes back like the tide. Show me her visits by month. I'd swear she keeps to a pattern even she doesn't know about."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "expr", "mode": "typed", "placeholder": "extract month from date" },
    { "type": "text",    "text": "AS month, COUNT(*) AS visits" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "visits" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "patron_id = 2" },
    { "type": "keyword", "text": "GROUP BY" },
    { "type": "blank",   "id": "grp", "mode": "typed", "placeholder": "group by what we extracted" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "text",    "text": "month" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT EXTRACT(MONTH FROM visit_date) AS month, COUNT(*) AS visits FROM visits WHERE patron_id = 2 GROUP BY EXTRACT(MONTH FROM visit_date) ORDER BY month",
    "order_sensitive": true
  },
  "hints": [
    { "when": "error",   "text": "Oldrich: 'EXTRACT something FROM a date. Look at the reference if you've forgotten the shape.'" },
    { "when": "default", "text": "Oldrich: 'Pull the month out of every visit_date. Group by the same thing. Count what falls into each.'" }
  ],
  "success": {
    "speaker": "oldrich",
    "text": "Oldrich studies the numbers. 'Sundays. Always Sundays. After mass. She tells me she's praying for her sister; I think she's praying for herself.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `cd sqllearning && npm run validate-content`
Expected: passes. Result is one row per month Mireska visited (~5-8 months).

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/puzzles/05.json
git commit -m "feat(chapter-5): add puzzle 05 — EXTRACT date function"
```

---

## Task 14: Puzzle 06 — "The face that doesn't change" (combined finale)

**Files:**
- Create: `sqllearning/content/chapters/05-tavern/puzzles/06.json`

- [ ] **Step 1: Write the puzzle**

```json
{
  "id": "06",
  "concept": "having",
  "brief": {
    "speaker": "oldrich",
    "text": "There's one I want you to find for me. He comes in every Wednesday. Every single Wednesday of this whole damned year. Sits at the corner. Drinks one cup. Doesn't talk. Doesn't stay. I've poured for fathers and their sons in this room — I've watched men grow grey at that bench. This one looks the same as the day he walked in. The same. Find me the patron who came on at least fifty different weeks of 1347. Tell me his id. I'll look him up myself."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "patron_id" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "visits" },
    { "type": "keyword", "text": "GROUP BY" },
    { "type": "text",    "text": "patron_id" },
    { "type": "keyword", "text": "HAVING" },
    { "type": "blank",   "id": "cond", "mode": "typed", "placeholder": "fifty distinct weeks" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT patron_id FROM visits GROUP BY patron_id HAVING COUNT(DISTINCT DATE_TRUNC('week', visit_date)) >= 50",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Oldrich: 'More than one? No. There is exactly one face I see every week. Tighten the threshold.'" },
    { "when": "wrong_count_low",  "text": "Oldrich: 'You found nobody. There IS one. Distinct *weeks*, not distinct visits.'" },
    { "when": "error",            "text": "Oldrich: 'COUNT — paren — DISTINCT — DATE_TRUNC of week from visit_date — close — close. Compare it to fifty.'" },
    { "when": "default",          "text": "Oldrich: 'Count the unique weeks each patron appeared in. Keep only the patron who appeared in at least fifty.'" }
  ],
  "success": {
    "speaker": "oldrich",
    "text": "Oldrich opens his patron register. He reads the id off your result. He stares at the page for a long moment. He looks up. 'Hemiunu,' he says. 'Just Hemiunu. No surname. No village. He paid in old coin.' He closes the book carefully. 'I don't want to be in this conversation anymore.'"
  }
}
```

- [ ] **Step 2: Validate — this is the most important validation in the chapter**

Run: `cd sqllearning && npm run validate-content`
Expected: passes. Result is exactly one row, value = 30 (Hemiunu's patron_id).

If the count is 0 or >1, the seed generator's distraction patrons are misaligned with the threshold. Tweak the generator (Task 7) and regenerate before continuing.

- [ ] **Step 3: Commit**

```bash
cd sqllearning
git add content/chapters/05-tavern/puzzles/06.json
git commit -m "feat(chapter-5): add puzzle 06 — Hemiunu reveal"
```

---

## Task 15: Wire chapter 5 into CHAPTER_ORDER and reference concepts

**Files:**
- Modify: `sqllearning/src/main.js`
- Modify: `sqllearning/src/reference.js`

- [ ] **Step 1: Append `'05-tavern'` to CHAPTER_ORDER**

In `sqllearning/src/main.js`, line 9, change:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census'];
```

to:

```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern'];
```

- [ ] **Step 2: Add `'05-tavern'` to CONCEPTS_FOR_CHAPTER**

In `sqllearning/src/reference.js`, add an entry below the `'04-census'` block (around line 41):

```js
  '05-tavern': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
    { slug: 'order-by', title: 'ORDER BY' },
    { slug: 'count', title: 'COUNT' },
    { slug: 'group-by', title: 'GROUP BY' },
    { slug: 'distinct', title: 'DISTINCT' },
    { slug: 'having', title: 'HAVING' },
    { slug: 'date-functions', title: 'Date functions' },
  ],
```

- [ ] **Step 3: Run all unit tests**

Run: `cd sqllearning && npm test`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke — boot the server and walk Ch 4 → Ch 5**

```bash
cd sqllearning && npm start &
SERVER_PID=$!
sleep 2
echo "Open http://localhost:5173 and verify:"
echo "  - You can navigate from Chapter 4 → Chapter 5 (auto-advance after 4 last puzzle, or via dev shortcut)"
echo "  - Chapter 5 boss intro renders (Carol's brief)"
echo "  - Puzzle 01 renders with TWO TEXT INPUTS (not dropdowns or chips)"
echo "  - Reference drawer shows DISTINCT, HAVING, Date functions in the nav"
echo "When done: kill $SERVER_PID"
```

If anything's off (typed inputs don't render, reference concepts missing), revisit the relevant task.

- [ ] **Step 5: Commit**

```bash
cd sqllearning
git add src/main.js src/reference.js
git commit -m "feat: wire Chapter 5 into CHAPTER_ORDER and reference concepts"
```

---

## Task 16: Playwright smoke test for Chapter 5 Puzzle 01

**Files:**
- Modify: `sqllearning/tests/e2e-smoke.spec.js`

- [ ] **Step 1: Read the existing Chapter 4 smoke spec for the pattern**

Run: `cd sqllearning && grep -n "04-census\|Chapter 4" tests/e2e-smoke.spec.js`
Note the test that handles Chapter 4 — Chapter 5 will follow the same shape with the typing input as the differentiator.

- [ ] **Step 2: Add a Chapter 5 Puzzle 01 walkthrough**

In `sqllearning/tests/e2e-smoke.spec.js`, append a new test after the Chapter 4 test:

```js
test('Chapter 5 Puzzle 01 — typing mechanic, type and submit', async ({ page }) => {
  // Set savestate directly so we land on Chapter 5 Puzzle 01.
  await page.goto('http://localhost:5173/');
  await page.evaluate(() => {
    localStorage.setItem('chrono_save', JSON.stringify({
      currentChapterId: '05-tavern',
      solvedPuzzleIds: { '01-onboarding': ['01','02','03','04','05'],
                         '02-pharaoh':    ['01','02','03','04','05','06'],
                         '03-speakeasy':  ['01','02','03','04','05','06'],
                         '04-census':     ['01','02','03','04','05','06'] },
    }));
  });
  await page.reload();

  // Confirm typed inputs render (not selects, not chip slots)
  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(2);

  // Fill them with the canonical answer
  await inputs.nth(0).fill('visit_id, patron_id, visit_date, tab_groschen');
  await inputs.nth(1).fill('visits');

  // Submit and confirm success state
  await page.click('#run-btn');
  await expect(page.locator('.bubble.success')).toBeVisible({ timeout: 5000 });
});
```

If the savestate key isn't `chrono_save` or solved-puzzle structure differs, fix the names by reading `src/state.js` first. The existing Ch 4 spec already does this dance — copy that exact shape.

- [ ] **Step 3: Run the E2E smoke**

```bash
cd sqllearning
npm start &
SERVER_PID=$!
sleep 2
npm run test:e2e
TEST_EXIT=$?
kill $SERVER_PID
exit $TEST_EXIT
```

Expected: all E2E tests pass, including the new Chapter 5 test.

- [ ] **Step 4: Commit**

```bash
cd sqllearning
git add tests/e2e-smoke.spec.js
git commit -m "test(e2e): add Chapter 5 Puzzle 01 smoke walkthrough"
```

---

## Task 17: Manual playtest checklist update

**Files:**
- Modify: `sqllearning/docs/playtest-checklist.md`

- [ ] **Step 1: Append a Chapter 5 section**

In `sqllearning/docs/playtest-checklist.md`, append after the existing Chapter 4 section:

```markdown
## Chapter 5 — Oldrich's Repeat Customers

**Boot & navigation**
- [ ] Boot the server. Open the game in a fresh browser session (no save state).
- [ ] Solve Chapters 1–4 OR seed localStorage with all prior chapters solved.
- [ ] Confirm Chapter 5 auto-advances or is selectable.
- [ ] Carol's boss intro renders, mentioning the parchment-and-candle bookkeeping detail.

**Mechanic — typing**
- [ ] All Chapter 5 puzzles render TEXT INPUTS for blanks (not dropdowns, not word-bank chips).
- [ ] Inputs accept free-form text including parentheses, asterisks, and quotes.
- [ ] Run button is disabled until every blank has at least one character.
- [ ] After a successful run, inputs become read-only / disabled.

**Per-puzzle correctness**
- [ ] **Puzzle 01:** Type `visit_id, patron_id, visit_date, tab_groschen` and `visits`. Submit. Success copy from Oldrich appears.
- [ ] **Puzzle 01:** Type a wrong table name (e.g. `oldrich`). Submit. The error hint fires (not a generic hint).
- [ ] **Puzzle 02:** Type `COUNT(DISTINCT patron_id)`. Success.
- [ ] **Puzzle 02:** Type `COUNT(*)` instead. The wrong-count-high hint fires.
- [ ] **Puzzle 03:** Type `COUNT(*)` and `patron_id`. Success. Pavel is at the top of the result.
- [ ] **Puzzle 04:** Type `COUNT(*) >= 20`. Success. Six rows.
- [ ] **Puzzle 04:** Type `COUNT(*) > 20` (strict greater). The wrong-count-low hint fires.
- [ ] **Puzzle 05:** Type `EXTRACT(MONTH FROM visit_date)` for both blanks. Success. Mireska's success copy mentions Sundays.
- [ ] **Puzzle 06:** Type `COUNT(DISTINCT DATE_TRUNC('week', visit_date)) >= 50`. Success. Result is exactly one row, patron_id = 30. Oldrich's success copy reveals the name "Hemiunu" and that he paid in old coin.
- [ ] **Puzzle 06:** Type a wrong threshold (e.g. `>= 30`). The wrong-count-high hint fires.

**Reference drawer**
- [ ] DISTINCT, HAVING, Date functions all appear in the reference drawer when on Chapter 5.
- [ ] Each loads and renders without "Could not load reference" error.

**Outro / Chapter 6 stinger**
- [ ] After solving Puzzle 06, the chapter outro fires.
- [ ] Carol's outro mentions Old Kingdom Egypt, 1920s Chicago, 1890 New York, and 1347 Prague together.
- [ ] The line "Hope you've been thinking about how to read more than one table at a time" renders.

**Browser compat**
- [ ] All of the above passes in Chrome.
- [ ] All of the above passes in Safari.

**Visual**
- [ ] Typed inputs don't visually crowd the surrounding query tokens.
- [ ] Focused input has a visible focus ring.
- [ ] Inputs grow horizontally when text exceeds default width (or scroll cleanly if fixed-width).
```

- [ ] **Step 2: Commit**

```bash
cd sqllearning
git add docs/playtest-checklist.md
git commit -m "docs: extend playtest checklist with Chapter 5 manual steps"
```

---

## Task 18: Final integration sweep

After all prior tasks, do a full verification pass before declaring Chapter 5 shipped.

- [ ] **Step 1: Run the full test suite**

```bash
cd sqllearning && npm test && npm run validate-content
```

Expected: all unit tests pass, content validator reports all 24 puzzles (across chapters 1-5) pass their expected SQL against their seeds.

- [ ] **Step 2: Run the E2E smoke**

```bash
cd sqllearning && npm start &
SERVER_PID=$!
sleep 2
npm run test:e2e
kill $SERVER_PID
```

Expected: all Playwright tests pass.

- [ ] **Step 3: One full manual playthrough of Chapter 5**

Walk all 6 puzzles in order in a real browser. Spot-check that the dialogue lands as a story (not just a sequence of correct answers). Note any narrative tweaks for follow-up — but don't fix them in this plan; surface them for Max to decide.

- [ ] **Step 4: Verify no untracked or modified files lurk**

Run: `git status --short | grep sqllearning`
Expected: clean. If anything shows up, investigate before declaring done.

- [ ] **Step 5: Tag or mark the milestone**

```bash
cd sqllearning
git tag milestone-d-chapter-5
```

(Optional — matches the existing `milestone-c2` tag pattern.)

---

## Self-review notes

Spec coverage check:
- Mechanic (typing) — Tasks 1, 2 ✓
- Data design (patrons + visits, Hemiunu plant) — Task 7 ✓
- Six puzzles in the proposed arc — Tasks 9–14 ✓
- Narrative draft (cold open, per-puzzle, outro) — Tasks 8, 9–14 ✓
- Engine changes minimal & additive — Tasks 2, 3 ✓
- Speakers/CHAPTER_ORDER/reference concepts wired — Tasks 3, 15 ✓
- Reference markdown for DISTINCT, HAVING, date-functions — Tasks 4, 5, 6 ✓
- Testing — content validator (auto), Playwright smoke, manual checklist — Tasks 9–14 (auto), 16, 17 ✓

Spec's three "open questions":
- Generator vs hand-author — Task 7 chose generator with deterministic patterns. Resolved.
- Hemiunu's specific patron_id — Task 7 chose 30. Resolved.
- Typed input width — Task 2 chose `width: auto; min-width: 4ch`. Resolved.

No placeholders, no TBDs. All code blocks are complete and runnable.
