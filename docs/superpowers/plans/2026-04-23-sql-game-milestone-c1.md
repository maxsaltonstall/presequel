# SQL Learning Game — Milestone C1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chapter 3 "The Speakeasy Ledger" end-to-end in a new **word-bank** mechanic mode. The mechanic flip is the season's first major pacing beat. Player solves 6 new puzzles teaching `ORDER BY`, `LIKE`, `IS NULL`, and string functions.

**Architecture:** Engine-extending and content-additive. One new renderer (`renderTemplateWordBank`) joins the existing `renderTemplateDropdown`. A tiny dispatcher in `playPuzzle` selects renderer based on chapter's `mechanic_mode`. Puzzle JSON schema stays identical — only the mode field changes. New Chapter 3 content + reference markdown.

**Tech Stack:** unchanged from Milestone B.

**What ships at the end of Milestone C1:**
- Chapter 3 playable end-to-end from Chapter 2's Next button
- 6 new puzzles in **word_bank** mechanic mode (dropdowns → slots + clickable token bank)
- New reference entries: `ORDER BY`, `LIKE`, `IS NULL`, `string-functions`
- Gladys Vance speaks with her own voice in bubbles
- Hemiunu surfaces via a string-function reveal in Chapter 3's final puzzle
- CSS for word-bank slots and token chips
- Playwright smoke extended to cover Ch3 word-bank interaction
- All tests green (unit + integration + e2e + content validator)

---

## Word-bank renderer design (reference for task code)

**Puzzle JSON shape unchanged.** A word-bank puzzle uses the same `template` + `blank` structure as dropdown puzzles. The only difference is the chapter's `mechanic_mode: "word_bank"`.

**Token pool construction.** At puzzle start, collect every `blank.options` across the template into a single array. Shuffle once. Display below the slots. No dedup (duplicates in the pool are meaningful if a template has the same token in two slots).

**Interactions (consumed model, click-based):**
- Click a token in the bank → token disappears from bank, fills the first empty slot.
- Click a filled slot → token returns to the *end* of the bank; slot becomes empty.
- "Run query" enables when every slot has a value.

**Visual:** slots render as dashed boxes when empty, solid value-colored when filled. Bank chips render as raised pill buttons.

**Distractors:** implicit — each blank's options array includes the correct answer plus wrong choices. When pooled across 3 blanks with 3 options each, the bank has 9 tokens (3 correct + 6 distractors). No separate distractors field needed.

---

## File Structure

Files created:
- `content/chapters/03-speakeasy/chapter.json`
- `content/chapters/03-speakeasy/seed.sql`
- `content/chapters/03-speakeasy/puzzles/01.json` through `06.json`
- `content/reference/order-by.md`
- `content/reference/like.md`
- `content/reference/is-null.md`
- `content/reference/string-functions.md`
- `tests/word-bank.test.js` — pure helpers for slot/bank manipulation

Files modified:
- `src/puzzle.js` — add `renderTemplateWordBank`, `buildInitialBank`, `fillFirstEmptySlot`, `returnSlotToBank`; add mode dispatcher in `playPuzzle`
- `src/dialogue.js` — add `gladys` to `SPEAKERS`
- `src/reference.js` — add `03-speakeasy` to `CONCEPTS_FOR_CHAPTER`
- `src/main.js` — add `03-speakeasy` to `CHAPTER_ORDER`
- `style.css` — slot and token-chip styles
- `tests/e2e-smoke.spec.js` — Ch3 word-bank puzzle smoke
- `docs/playtest-checklist.md` — Ch3 section

---

## Phase 0 — Engine: word-bank renderer

### Task 1: Word-bank pure helpers (TDD)

Three pure functions handle bank/slot state transitions. Unit-test them.

**Files:**
- Modify: `src/puzzle.js` (add three exports near the other pure helpers)
- Create: `tests/word-bank.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/word-bank.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialBank, fillFirstEmptySlot, returnSlotToBank,
} from '../src/puzzle.js';

const TEMPLATE = [
  { type: 'keyword', text: 'SELECT' },
  { type: 'blank', id: 'a', mode: 'word_bank', options: ['x', 'y', 'z'] },
  { type: 'keyword', text: 'FROM' },
  { type: 'blank', id: 'b', mode: 'word_bank', options: ['p', 'q'] },
];

test('buildInitialBank pools every blank option', () => {
  const bank = buildInitialBank(TEMPLATE);
  bank.sort();
  assert.deepEqual(bank, ['p', 'q', 'x', 'y', 'z']);
});

test('fillFirstEmptySlot fills slot a when all empty', () => {
  const result = fillFirstEmptySlot(TEMPLATE, {}, ['p','q','x','y','z'], 'x');
  assert.equal(result.blanks.a, 'x');
  assert.equal(result.blanks.b, undefined);
  assert.deepEqual(result.bank.sort(), ['p','q','y','z']);
});

test('fillFirstEmptySlot fills slot b when a is already filled', () => {
  const result = fillFirstEmptySlot(TEMPLATE, { a: 'x' }, ['p','q','y','z'], 'p');
  assert.equal(result.blanks.a, 'x');
  assert.equal(result.blanks.b, 'p');
  assert.deepEqual(result.bank.sort(), ['q','y','z']);
});

test('fillFirstEmptySlot is a no-op when all slots are filled', () => {
  const result = fillFirstEmptySlot(TEMPLATE, { a: 'x', b: 'p' }, ['q','y','z'], 'y');
  assert.deepEqual(result.blanks, { a: 'x', b: 'p' });
  assert.deepEqual(result.bank, ['q','y','z']);
});

test('fillFirstEmptySlot no-op if token is not in bank', () => {
  const result = fillFirstEmptySlot(TEMPLATE, {}, ['p','q'], 'x');
  assert.deepEqual(result.blanks, {});
  assert.deepEqual(result.bank, ['p','q']);
});

test('returnSlotToBank empties the slot and appends token to bank end', () => {
  const result = returnSlotToBank(TEMPLATE, { a: 'x', b: 'p' }, ['q','y','z'], 'b');
  assert.equal(result.blanks.a, 'x');
  assert.equal(result.blanks.b, undefined);
  // token 'p' appended to end
  assert.equal(result.bank[result.bank.length - 1], 'p');
  assert.equal(result.bank.length, 4);
});

test('returnSlotToBank is a no-op if slot is already empty', () => {
  const result = returnSlotToBank(TEMPLATE, { a: 'x' }, ['q','y','z','p'], 'b');
  assert.deepEqual(result.blanks, { a: 'x' });
  assert.deepEqual(result.bank, ['q','y','z','p']);
});

test('duplicate tokens in pool are preserved (two instances of "year")', () => {
  const tmpl = [
    { type: 'blank', id: 'c1', mode: 'word_bank', options: ['year', 'amount'] },
    { type: 'blank', id: 'c2', mode: 'word_bank', options: ['year', 'name'] },
  ];
  const bank = buildInitialBank(tmpl);
  assert.equal(bank.filter(t => t === 'year').length, 2);
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npm test -- tests/word-bank.test.js`
Expected: FAIL — helpers not yet exported from `src/puzzle.js`.

- [ ] **Step 3: Implement helpers in src/puzzle.js**

Add to `src/puzzle.js` (near the other pure helpers — `assembleSql`, `compareRows`, `selectHint`):

```js
export function buildInitialBank(template) {
  const tokens = [];
  for (const tok of template) {
    if (tok.type === 'blank' && Array.isArray(tok.options)) {
      tokens.push(...tok.options);
    }
  }
  return tokens;
}

function firstEmptySlotId(template, blanks) {
  for (const tok of template) {
    if (tok.type === 'blank' && (blanks[tok.id] === undefined || blanks[tok.id] === '')) {
      return tok.id;
    }
  }
  return null;
}

export function fillFirstEmptySlot(template, blanks, bank, token) {
  const slotId = firstEmptySlotId(template, blanks);
  if (!slotId) return { blanks, bank };
  const idx = bank.indexOf(token);
  if (idx === -1) return { blanks, bank };
  const newBank = bank.slice(0, idx).concat(bank.slice(idx + 1));
  const newBlanks = { ...blanks, [slotId]: token };
  return { blanks: newBlanks, bank: newBank };
}

export function returnSlotToBank(template, blanks, bank, slotId) {
  const current = blanks[slotId];
  if (current === undefined || current === '') return { blanks, bank };
  const newBlanks = { ...blanks };
  delete newBlanks[slotId];
  const newBank = [...bank, current];
  return { blanks: newBlanks, bank: newBank };
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npm test -- tests/word-bank.test.js`
Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/puzzle.js tests/word-bank.test.js
git commit -m "$(cat <<'EOF'
Add word-bank pure helpers: buildInitialBank, fillFirstEmptySlot, returnSlotToBank

TDD'd with 8 unit tests covering happy paths, no-ops, and duplicate
token preservation. Renderer and playPuzzle wiring come next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Word-bank renderer + mode dispatch in playPuzzle

Add the DOM-rendering half of word-bank mode and wire the dispatcher.

**Files:**
- Modify: `src/puzzle.js`

- [ ] **Step 1: Add `renderTemplateWordBank` function**

Add this function to `src/puzzle.js` near the existing `renderTemplateDropdown`:

```js
function renderTemplateWordBank(template, state, onSlotClick, onBankClick) {
  // state = { blanks: {...}, bank: [...] }
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
      const slot = document.createElement('span');
      const val = state.blanks[tok.id];
      slot.className = val ? 'slot filled' : 'slot empty';
      slot.dataset.slot = tok.id;
      slot.textContent = val || '—';
      slot.addEventListener('click', () => onSlotClick(tok.id));
      query.appendChild(slot);
      query.appendChild(document.createTextNode(' '));
    }
  }
  area.appendChild(query);

  const bankContainer = document.createElement('div');
  bankContainer.className = 'word-bank';
  const bankLabel = document.createElement('div');
  bankLabel.className = 'word-bank-label';
  bankLabel.textContent = 'Word bank';
  bankContainer.appendChild(bankLabel);
  const bankList = document.createElement('div');
  bankList.className = 'word-bank-list';
  for (let i = 0; i < state.bank.length; i++) {
    const token = state.bank[i];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'word-bank-chip';
    chip.textContent = token;
    chip.addEventListener('click', () => onBankClick(i));
    bankList.appendChild(chip);
  }
  bankContainer.appendChild(bankList);
  area.appendChild(bankContainer);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'run-btn';
  runBtn.id = 'run-btn';
  runBtn.textContent = 'Run query';
  area.appendChild(runBtn);

  return runBtn;
}
```

- [ ] **Step 2: Modify `playPuzzle` to dispatch on `mechanic_mode`**

Replace the body of `playPuzzle` (keep the signature and the dialogue/expected-rows bookkeeping). The key changes: thread a `mechanic_mode` parameter, and for word-bank mode maintain `{ blanks, bank }` state and re-render on every interaction.

Find the existing `playPuzzle` function. Update its signature to accept `mechanicMode`:

```js
export async function playPuzzle({ chapterId, puzzle, mechanicMode, onSolved, onAttempt }) {
```

Replace the rendering + event-wiring block (everything from `const blanks = {};` through the end of the function) with:

```js
  clearResults();
  const puzzleArea = document.getElementById('puzzle-area');
  puzzleArea.dataset.header = `PUZZLE ${puzzle.id}`;

  pushBubble({ speaker: puzzle.brief.speaker, text: puzzle.brief.text });

  const expectedPromise = runQuery(chapterId, puzzle.expected.sql);

  let blanks = {};
  let bank = mechanicMode === 'word_bank' ? shuffleInPlace(buildInitialBank(puzzle.template)) : [];
  let busy = false;
  let solved = false;
  let runBtn;

  function onSubmit() {
    // (shared submission handler attached after render)
  }

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
    } else {
      runBtn = renderTemplateDropdown(puzzle.template, blanks, (id, val) => {
        blanks[id] = val;
        runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
      });
    }
    runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
    runBtn.addEventListener('click', onSubmit);
  }

  async function handleSubmit() {
    if (busy || solved) return;
    busy = true;
    if (runBtn) runBtn.disabled = true;
    try {
      const sql = assembleSql(puzzle.template, blanks);
      const [actual, expected] = await Promise.all([
        runQuery(chapterId, sql),
        expectedPromise,
      ]);
      renderResults(actual);
      onAttempt?.();

      if (actual.error) {
        const h = selectHint(puzzle.hints, 'error');
        pushHint(h.text);
        return;
      }
      if (expected.error) {
        pushHint('Something went wrong with the reference solution. Please report this puzzle.');
        return;
      }
      const cmp = compareRows(actual.rows, expected.rows, !!puzzle.expected.order_sensitive);
      if (cmp.status === 'match') {
        pushSuccess({ speaker: puzzle.success.speaker, text: puzzle.success.text });
        solved = true;
        onSolved?.();
        renderNextButton();
      } else {
        const h = selectHint(puzzle.hints, cmp.status);
        pushHint(h.text);
      }
    } catch (err) {
      pushHint('Could not reach the archives. Try again.');
    } finally {
      busy = false;
      if (runBtn) runBtn.disabled = solved || !allFilled(puzzle.template, blanks);
    }
  }

  // Wire the handler once and let rerender() re-attach on each render
  onSubmit = handleSubmit;

  rerender();
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
```

Note on `onSubmit`: it's hoisted via `var`-style assignment pattern. Simpler alternative if the above feels fragile: just reference `handleSubmit` directly in the `addEventListener` call inside `rerender`. Adjust if needed.

- [ ] **Step 3: Update `main.js` to pass `mechanicMode` to `playPuzzle`**

Find in `src/main.js`:

```js
  await playPuzzle({
    chapterId,
    puzzle,
    onAttempt: () => {
```

Change to:

```js
  await playPuzzle({
    chapterId,
    puzzle,
    mechanicMode: chapter.mechanic_mode,
    onAttempt: () => {
```

- [ ] **Step 4: Verify existing dropdown tests still pass**

Run: `npm test`
Expected: 73 tests pass (65 baseline + 8 new word-bank unit tests). The dropdown E2E smokes still pass because `mechanic_mode: 'dropdown'` routes to the original renderer.

Run: `npm run test:e2e`
Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/puzzle.js src/main.js
git commit -m "$(cat <<'EOF'
Add word-bank renderer; dispatch by chapter mechanic_mode

playPuzzle now selects between the existing dropdown renderer and the
new word-bank renderer based on chapter.mechanic_mode. Blank/bank
state lives in the closure and re-renders on every click.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: CSS for slots and word-bank chips

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Append word-bank styles to style.css**

Append to `style.css`:

```css
/* Word-bank mode */
.slot {
  display: inline-block;
  min-width: 60px;
  padding: 2px 10px;
  margin: 0 2px;
  border-radius: 4px;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  transition: background 0.1s;
}
.slot.empty {
  background: transparent;
  color: var(--fg-muted);
  border: 1px dashed var(--slot-border);
}
.slot.filled {
  background: var(--slot);
  color: var(--accent-2);
  border: 1px solid var(--slot-border);
}
.slot.filled:hover { background: #364a36; }

.word-bank {
  margin-top: 18px;
  padding: 10px 12px;
  background: #0f0f16;
  border-radius: 4px;
}
.word-bank-label {
  font-size: 10px;
  letter-spacing: 1.5px;
  color: var(--fg-muted);
  margin-bottom: 8px;
}
.word-bank-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.word-bank-chip {
  background: #2a2a3f;
  color: #c8c8e6;
  border: 1px solid #3a3a55;
  padding: 3px 10px;
  border-radius: 12px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s, transform 0.05s;
}
.word-bank-chip:hover { background: #3a3a55; }
.word-bank-chip:active { transform: scale(0.97); }
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "$(cat <<'EOF'
Style word-bank slots and chips

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — Chapter 3 glue + content

### Task 4: Engine glue for Chapter 3

**Files:**
- Modify: `src/main.js` (CHAPTER_ORDER)
- Modify: `src/dialogue.js` (SPEAKERS)
- Modify: `src/reference.js` (CONCEPTS_FOR_CHAPTER)

- [ ] **Step 1: Add '03-speakeasy' to CHAPTER_ORDER in src/main.js**

Find:
```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh'];
```

Change to:
```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy'];
```

- [ ] **Step 2: Add `gladys` to SPEAKERS in src/dialogue.js**

Find:
```js
const SPEAKERS = {
  carol: { label: 'Carol', role: 'boss' },
  client: { label: 'Client', role: 'client' },
  pharaoh: { label: 'Pharaoh Menkaure', role: 'client' },
  // Later chapters add more; unknown speakers fall through to "Client"
};
```

Change to:
```js
const SPEAKERS = {
  carol:   { label: 'Carol', role: 'boss' },
  client:  { label: 'Client', role: 'client' },
  pharaoh: { label: 'Pharaoh Menkaure', role: 'client' },
  gladys:  { label: 'Gladys Vance', role: 'client' },
  // Later chapters add more; unknown speakers fall through to "Client"
};
```

- [ ] **Step 3: Extend CONCEPTS_FOR_CHAPTER in src/reference.js**

Add this entry to the existing `CONCEPTS_FOR_CHAPTER` object:

```js
  '03-speakeasy': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
    { slug: 'order-by', title: 'ORDER BY' },
    { slug: 'like',    title: 'LIKE' },
    { slug: 'is-null', title: 'IS NULL' },
    { slug: 'string-functions', title: 'String functions' },
  ],
```

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/dialogue.js src/reference.js
git commit -m "$(cat <<'EOF'
Wire Chapter 3 into engine: CHAPTER_ORDER, SPEAKERS, reference concepts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Chapter 3 seed, metadata, and reference markdown

**Files:**
- Create: `content/chapters/03-speakeasy/seed.sql`
- Create: `content/chapters/03-speakeasy/chapter.json`
- Create: `content/reference/order-by.md`
- Create: `content/reference/like.md`
- Create: `content/reference/is-null.md`
- Create: `content/reference/string-functions.md`

Use the Write tool for each file (markdown has fenced code blocks).

- [ ] **Step 1: Create seed.sql (shifts + patrons tables, ~200 rows)**

Create `content/chapters/03-speakeasy/seed.sql`:

```sql
-- Chapter 3: The Speakeasy Ledger
-- Chicago, 1927. Gladys Vance's speakeasy "The Hemlock Room".
-- Two tables:
--   shifts  — staff work schedule (80 rows across Feb–March 1927)
--   patrons — guest book of customers and their tabs (120 rows)
-- The missing piece: Louise Hayes (head bartender) stopped showing up after
-- March 14. A patron that night left a scrawled, barely-legible name
-- in the guestbook (stored in DB as NULL name).

CREATE TABLE shifts (
  id           INTEGER,
  staff_name   VARCHAR,
  role         VARCHAR,
  shift_date   DATE,
  hours_worked INTEGER
);

INSERT INTO shifts VALUES
  (1,  'Louise Hayes',    'bartender', DATE '1927-02-01', 8),
  (2,  'Frank Doolan',    'doorman',   DATE '1927-02-01', 10),
  (3,  'Mavis Hart',      'server',    DATE '1927-02-01', 7),
  (4,  'Louise Hayes',    'bartender', DATE '1927-02-03', 8),
  (5,  'Frank Doolan',    'doorman',   DATE '1927-02-03', 10),
  (6,  'Mavis Hart',      'server',    DATE '1927-02-03', 6),
  (7,  'Louise Hayes',    'bartender', DATE '1927-02-05', 9),
  (8,  'Frank Doolan',    'doorman',   DATE '1927-02-05', 10),
  (9,  'Mavis Hart',      'server',    DATE '1927-02-05', 7),
  (10, 'Esther Nolan',    'server',    DATE '1927-02-05', 6),
  (11, 'Louise Hayes',    'bartender', DATE '1927-02-07', 8),
  (12, 'Frank Doolan',    'doorman',   DATE '1927-02-07', 10),
  (13, 'Mavis Hart',      'server',    DATE '1927-02-07', 7),
  (14, 'Louise Hayes',    'bartender', DATE '1927-02-10', 9),
  (15, 'Frank Doolan',    'doorman',   DATE '1927-02-10', 10),
  (16, 'Esther Nolan',    'server',    DATE '1927-02-10', 7),
  (17, 'Louise Hayes',    'bartender', DATE '1927-02-12', 8),
  (18, 'Frank Doolan',    'doorman',   DATE '1927-02-12', 10),
  (19, 'Mavis Hart',      'server',    DATE '1927-02-12', 6),
  (20, 'Louise Hayes',    'bartender', DATE '1927-02-14', 9),
  (21, 'Frank Doolan',    'doorman',   DATE '1927-02-14', 10),
  (22, 'Mavis Hart',      'server',    DATE '1927-02-14', 8),
  (23, 'Esther Nolan',    'server',    DATE '1927-02-14', 7),
  (24, 'Louise Hayes',    'bartender', DATE '1927-02-17', 8),
  (25, 'Frank Doolan',    'doorman',   DATE '1927-02-17', 10),
  (26, 'Mavis Hart',      'server',    DATE '1927-02-17', 7),
  (27, 'Louise Hayes',    'bartender', DATE '1927-02-19', 9),
  (28, 'Frank Doolan',    'doorman',   DATE '1927-02-19', 10),
  (29, 'Esther Nolan',    'server',    DATE '1927-02-19', 8),
  (30, 'Louise Hayes',    'bartender', DATE '1927-02-21', 8),
  (31, 'Frank Doolan',    'doorman',   DATE '1927-02-21', 10),
  (32, 'Mavis Hart',      'server',    DATE '1927-02-21', 7),
  (33, 'Louise Hayes',    'bartender', DATE '1927-02-24', 9),
  (34, 'Frank Doolan',    'doorman',   DATE '1927-02-24', 10),
  (35, 'Esther Nolan',    'server',    DATE '1927-02-24', 7),
  (36, 'Mavis Hart',      'server',    DATE '1927-02-26', 6),
  (37, 'Louise Hayes',    'bartender', DATE '1927-02-26', 8),
  (38, 'Frank Doolan',    'doorman',   DATE '1927-02-26', 10),
  (39, 'Esther Nolan',    'server',    DATE '1927-02-28', 8),
  (40, 'Louise Hayes',    'bartender', DATE '1927-02-28', 9),
  (41, 'Frank Doolan',    'doorman',   DATE '1927-02-28', 10),
  (42, 'Louise Hayes',    'bartender', DATE '1927-03-03', 8),
  (43, 'Frank Doolan',    'doorman',   DATE '1927-03-03', 10),
  (44, 'Mavis Hart',      'server',    DATE '1927-03-03', 7),
  (45, 'Louise Hayes',    'bartender', DATE '1927-03-05', 9),
  (46, 'Frank Doolan',    'doorman',   DATE '1927-03-05', 10),
  (47, 'Esther Nolan',    'server',    DATE '1927-03-05', 7),
  (48, 'Louise Hayes',    'bartender', DATE '1927-03-07', 8),
  (49, 'Frank Doolan',    'doorman',   DATE '1927-03-07', 10),
  (50, 'Mavis Hart',      'server',    DATE '1927-03-07', 7),
  (51, 'Louise Hayes',    'bartender', DATE '1927-03-10', 9),
  (52, 'Frank Doolan',    'doorman',   DATE '1927-03-10', 10),
  (53, 'Esther Nolan',    'server',    DATE '1927-03-10', 8),
  (54, 'Mavis Hart',      'server',    DATE '1927-03-12', 7),
  (55, 'Louise Hayes',    'bartender', DATE '1927-03-12', 8),
  (56, 'Frank Doolan',    'doorman',   DATE '1927-03-12', 10),
  -- March 14: Louise's LAST shift
  (57, 'Louise Hayes',    'bartender', DATE '1927-03-14', 9),
  (58, 'Frank Doolan',    'doorman',   DATE '1927-03-14', 10),
  (59, 'Mavis Hart',      'server',    DATE '1927-03-14', 8),
  (60, 'Esther Nolan',    'server',    DATE '1927-03-14', 7),
  -- After March 14: Louise is GONE. Others continue.
  (61, 'Frank Doolan',    'doorman',   DATE '1927-03-17', 10),
  (62, 'Mavis Hart',      'server',    DATE '1927-03-17', 8),
  (63, 'Esther Nolan',    'server',    DATE '1927-03-17', 7),
  (64, 'Frank Doolan',    'doorman',   DATE '1927-03-19', 10),
  (65, 'Mavis Hart',      'server',    DATE '1927-03-19', 8),
  (66, 'Esther Nolan',    'server',    DATE '1927-03-19', 8),
  (67, 'Frank Doolan',    'doorman',   DATE '1927-03-21', 10),
  (68, 'Mavis Hart',      'server',    DATE '1927-03-21', 7),
  (69, 'Esther Nolan',    'server',    DATE '1927-03-21', 8),
  (70, 'Frank Doolan',    'doorman',   DATE '1927-03-24', 10),
  (71, 'Mavis Hart',      'server',    DATE '1927-03-24', 8),
  (72, 'Esther Nolan',    'server',    DATE '1927-03-24', 7),
  (73, 'Frank Doolan',    'doorman',   DATE '1927-03-26', 10),
  (74, 'Mavis Hart',      'server',    DATE '1927-03-26', 8),
  (75, 'Esther Nolan',    'server',    DATE '1927-03-26', 8),
  (76, 'Frank Doolan',    'doorman',   DATE '1927-03-28', 10),
  (77, 'Mavis Hart',      'server',    DATE '1927-03-28', 8),
  (78, 'Esther Nolan',    'server',    DATE '1927-03-28', 7),
  (79, 'Frank Doolan',    'doorman',   DATE '1927-03-31', 10),
  (80, 'Mavis Hart',      'server',    DATE '1927-03-31', 9);

CREATE TABLE patrons (
  id           INTEGER,
  name         VARCHAR,      -- may be NULL for illegible guestbook entries
  visit_date   DATE,
  tab_cents    INTEGER,
  party_size   INTEGER
);

-- 120 patrons. Most are regulars with normal tabs. One NULL-named patron
-- showed up March 14 — Louise's last night. Their tab was unusually high
-- and the party_size was 1.
-- The NULL-named March 14 patron is the Hemiunu surrogate; a later puzzle
-- uses a string function on an adjacent column to reveal the pattern.

INSERT INTO patrons VALUES
  (1,   'Lawson, H',            DATE '1927-02-01', 430,  2),
  (2,   'McCready, J',          DATE '1927-02-01', 210,  1),
  (3,   'Ingram, W',            DATE '1927-02-01', 560,  3),
  (4,   'Lawson, H',            DATE '1927-02-03', 280,  2),
  (5,   'Pinto, E',             DATE '1927-02-03', 490,  4),
  (6,   'McCready, J',          DATE '1927-02-05', 180,  1),
  (7,   'Harriman, C',          DATE '1927-02-05', 620,  2),
  (8,   'Ingram, W',            DATE '1927-02-05', 470,  3),
  (9,   'Pinto, E',             DATE '1927-02-07', 380,  2),
  (10,  'Dalton, R',             DATE '1927-02-07', 310, 2),
  (11,  'Lawson, H',            DATE '1927-02-07', 240,  1),
  (12,  'McCready, J',          DATE '1927-02-10', 510,  3),
  (13,  'Harriman, C',          DATE '1927-02-10', 290,  2),
  (14,  'Ingram, W',            DATE '1927-02-12', 650,  4),
  (15,  'Pinto, E',             DATE '1927-02-12', 440,  3),
  (16,  'Lawson, H',            DATE '1927-02-12', 220,  1),
  (17,  'Dalton, R',             DATE '1927-02-14', 680, 3),
  (18,  'Harriman, C',          DATE '1927-02-14', 530,  2),
  (19,  'McCready, J',          DATE '1927-02-14', 340,  2),
  (20,  'Ingram, W',            DATE '1927-02-14', 410,  3),
  (21,  'Pinto, E',             DATE '1927-02-17', 370,  2),
  (22,  'Lawson, H',            DATE '1927-02-17', 260,  1),
  (23,  'Harriman, C',          DATE '1927-02-17', 580,  3),
  (24,  'Dalton, R',             DATE '1927-02-19', 420, 2),
  (25,  'McCready, J',          DATE '1927-02-19', 300,  2),
  (26,  'Ingram, W',            DATE '1927-02-19', 510,  3),
  (27,  'Pinto, E',             DATE '1927-02-21', 390,  2),
  (28,  'Lawson, H',            DATE '1927-02-21', 270,  1),
  (29,  'Harriman, C',          DATE '1927-02-21', 550,  3),
  (30,  'Dalton, R',             DATE '1927-02-24', 460, 3),
  (31,  'McCready, J',          DATE '1927-02-24', 330,  2),
  (32,  'Ingram, W',            DATE '1927-02-24', 480,  3),
  (33,  'Pinto, E',             DATE '1927-02-26', 400,  2),
  (34,  'Lawson, H',            DATE '1927-02-26', 250,  1),
  (35,  'Harriman, C',          DATE '1927-02-26', 610,  4),
  (36,  'Dalton, R',             DATE '1927-02-28', 520, 3),
  (37,  'McCready, J',          DATE '1927-02-28', 360,  2),
  (38,  'Ingram, W',            DATE '1927-02-28', 450,  3),
  (39,  'Pinto, E',             DATE '1927-03-03', 385,  2),
  (40,  'Lawson, H',            DATE '1927-03-03', 230,  1),
  (41,  'Harriman, C',          DATE '1927-03-03', 540,  3),
  (42,  'Dalton, R',             DATE '1927-03-03', 500, 3),
  (43,  'McCready, J',          DATE '1927-03-05', 320,  2),
  (44,  'Ingram, W',            DATE '1927-03-05', 470,  3),
  (45,  'Pinto, E',             DATE '1927-03-05', 410,  2),
  (46,  'Lawson, H',            DATE '1927-03-07', 290,  1),
  (47,  'Harriman, C',          DATE '1927-03-07', 570,  3),
  (48,  'Dalton, R',             DATE '1927-03-07', 440, 2),
  (49,  'McCready, J',          DATE '1927-03-10', 350,  2),
  (50,  'Ingram, W',            DATE '1927-03-10', 490,  3),
  (51,  'Pinto, E',             DATE '1927-03-10', 420,  2),
  (52,  'Lawson, H',            DATE '1927-03-10', 280,  1),
  (53,  'Harriman, C',          DATE '1927-03-12', 600,  4),
  (54,  'Dalton, R',             DATE '1927-03-12', 450, 3),
  (55,  'McCready, J',          DATE '1927-03-12', 340,  2),
  (56,  'Ingram, W',            DATE '1927-03-12', 510,  3),
  -- March 14 — Louise's last night. Normal patrons + the mystery guest.
  (57,  'Pinto, E',             DATE '1927-03-14', 430,  2),
  (58,  'Harriman, C',          DATE '1927-03-14', 620,  3),
  (59,  'Dalton, R',             DATE '1927-03-14', 480, 3),
  (60,  'McCready, J',          DATE '1927-03-14', 360,  2),
  (61,  NULL,                   DATE '1927-03-14', 3400, 1),  -- THE MYSTERY GUEST
  (62,  'Ingram, W',            DATE '1927-03-14', 520,  3),
  (63,  'Lawson, H',            DATE '1927-03-14', 290,  1),
  -- After March 14, Louise gone, patrons continue
  (64,  'Pinto, E',             DATE '1927-03-17', 380,  2),
  (65,  'Harriman, C',          DATE '1927-03-17', 560,  3),
  (66,  'Dalton, R',             DATE '1927-03-17', 410, 2),
  (67,  'McCready, J',          DATE '1927-03-17', 320,  2),
  (68,  'Ingram, W',            DATE '1927-03-17', 470,  3),
  (69,  'Lawson, H',            DATE '1927-03-17', 260,  1),
  (70,  'Harriman, C',          DATE '1927-03-19', 590,  3),
  (71,  'Dalton, R',             DATE '1927-03-19', 430, 2),
  (72,  'McCready, J',          DATE '1927-03-19', 350,  2),
  (73,  'Pinto, E',             DATE '1927-03-19', 400,  2),
  (74,  'Ingram, W',            DATE '1927-03-19', 490,  3),
  (75,  'Lawson, H',            DATE '1927-03-19', 240,  1),
  (76,  'Harriman, C',          DATE '1927-03-21', 570,  3),
  (77,  'Dalton, R',             DATE '1927-03-21', 450, 3),
  (78,  'McCready, J',          DATE '1927-03-21', 330,  2),
  (79,  'Ingram, W',            DATE '1927-03-21', 510,  3),
  (80,  'Pinto, E',             DATE '1927-03-21', 395,  2),
  (81,  'Lawson, H',            DATE '1927-03-21', 270,  1),
  (82,  'Harriman, C',          DATE '1927-03-24', 610,  4),
  (83,  'Dalton, R',             DATE '1927-03-24', 460, 3),
  (84,  'McCready, J',          DATE '1927-03-24', 340,  2),
  (85,  'Ingram, W',            DATE '1927-03-24', 480,  3),
  (86,  'Pinto, E',             DATE '1927-03-24', 405,  2),
  (87,  'Lawson, H',            DATE '1927-03-24', 250,  1),
  (88,  'Harriman, C',          DATE '1927-03-26', 580,  3),
  (89,  'Dalton, R',             DATE '1927-03-26', 470, 3),
  (90,  'McCready, J',          DATE '1927-03-26', 360,  2),
  (91,  'Ingram, W',            DATE '1927-03-26', 500,  3),
  (92,  'Pinto, E',             DATE '1927-03-26', 415,  2),
  (93,  'Lawson, H',            DATE '1927-03-26', 265,  1),
  (94,  'Harriman, C',          DATE '1927-03-28', 595,  3),
  (95,  'Dalton, R',             DATE '1927-03-28', 455, 3),
  (96,  'McCready, J',          DATE '1927-03-28', 345,  2),
  (97,  'Ingram, W',            DATE '1927-03-28', 495,  3),
  (98,  'Pinto, E',             DATE '1927-03-28', 420,  2),
  (99,  'Lawson, H',            DATE '1927-03-28', 275,  1),
  (100, 'Harriman, C',          DATE '1927-03-31', 605,  4),
  (101, 'Dalton, R',             DATE '1927-03-31', 470, 3),
  (102, 'McCready, J',          DATE '1927-03-31', 355,  2),
  (103, 'Ingram, W',            DATE '1927-03-31', 485,  3),
  (104, 'Pinto, E',             DATE '1927-03-31', 425,  2),
  (105, 'Lawson, H',            DATE '1927-03-31', 280,  1),
  (106, 'Novak, K',             DATE '1927-02-03', 340,  2),
  (107, 'Novak, K',             DATE '1927-02-10', 380,  2),
  (108, 'Novak, K',             DATE '1927-02-17', 360,  2),
  (109, 'Novak, K',             DATE '1927-02-24', 395,  2),
  (110, 'Novak, K',             DATE '1927-03-03', 410,  2),
  (111, 'Novak, K',             DATE '1927-03-10', 375,  3),
  (112, 'Novak, K',             DATE '1927-03-17', 400,  2),
  (113, 'Novak, K',             DATE '1927-03-24', 385,  2),
  (114, 'Wexler, A',            DATE '1927-02-05', 520,  3),
  (115, 'Wexler, A',            DATE '1927-02-12', 490,  3),
  (116, 'Wexler, A',            DATE '1927-02-19', 510,  3),
  (117, 'Wexler, A',            DATE '1927-02-26', 475,  3),
  (118, 'Wexler, A',            DATE '1927-03-05', 505,  3),
  (119, 'Wexler, A',            DATE '1927-03-12', 485,  3),
  (120, 'Wexler, A',            DATE '1927-03-19', 515,  3);
```

- [ ] **Step 2: Create chapter.json**

Create `content/chapters/03-speakeasy/chapter.json`:

```json
{
  "id": "03-speakeasy",
  "ordinal": 3,
  "title": "The Speakeasy Ledger",
  "era": "Chicago, 1927",
  "client": {
    "name": "Gladys Vance",
    "portrait": "gladys.svg",
    "voice": "tired, shrewd, chain-smoking"
  },
  "boss_intro": "Carol slides a ledger across your desk. 'Gladys Vance. Runs The Hemlock Room. Her best bartender stopped showing up and she wants to know why. We're getting paid in gin. The mechanic shift: no more dropdowns. You pick tokens from a word bank and place them. Same SQL. Different hands.'",
  "concepts_introduced": ["order-by", "like", "is-null", "string-functions"],
  "concepts_reviewed": ["where", "comparison-operators"],
  "mechanic_mode": "word_bank",
  "arc_hook": "Louise Hayes stops working after March 14. A patron that night left no name in the guestbook — the entry is NULL. The shape of that NULL is the shape of what happened.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "Gladys pours you a drink. 'You found the shape of it, I think. Someone came in that night who shouldn't have.' Back at the office, Carol reads your notes twice. She says nothing for a long moment. Then: 'The name fragment. The one you pulled from the illegible entry. Say it out loud.' You say it. She sits down."
}
```

- [ ] **Step 3: Create reference markdown files**

`content/reference/order-by.md`:

```markdown
---
concept: order-by
title: ORDER BY
introduced_in: 03-speakeasy
---

# ORDER BY

`ORDER BY` sorts the rows that come back. It goes near the end of the query — after `WHERE`, before `LIMIT`.

## Syntax
```
SELECT columns FROM table ORDER BY column [ASC|DESC]
```

`ASC` is ascending (default — smallest or earliest first). `DESC` is descending. If you omit the direction, it's `ASC`.

## Examples

Shifts in chronological order:
```
SELECT staff_name, shift_date FROM shifts ORDER BY shift_date ASC
```

Most expensive tabs first:
```
SELECT name, tab_cents FROM patrons ORDER BY tab_cents DESC
```

## Combining with LIMIT

`ORDER BY` paired with `LIMIT` gives you "top N":
```
SELECT name, tab_cents FROM patrons ORDER BY tab_cents DESC LIMIT 5
```
```

`content/reference/like.md`:

```markdown
---
concept: like
title: LIKE
introduced_in: 03-speakeasy
---

# LIKE

`LIKE` matches text using patterns. It's used in a `WHERE` clause.

## Wildcards

- `%` — matches any number of characters (including zero).
- `_` — matches exactly one character.

## Syntax
```
WHERE column LIKE 'pattern'
```

## Examples

Names starting with L:
```
SELECT staff_name FROM shifts WHERE staff_name LIKE 'Louise%'
```

Names containing "Hayes" anywhere:
```
SELECT staff_name FROM shifts WHERE staff_name LIKE '%Hayes%'
```

Three-letter names exactly:
```
SELECT name FROM patrons WHERE name LIKE '___'
```
```

`content/reference/is-null.md`:

```markdown
---
concept: is-null
title: IS NULL
introduced_in: 03-speakeasy
---

# IS NULL

`NULL` represents an unknown or missing value in SQL. You can't compare `NULL` with `=` — the result of `NULL = NULL` is not `true`, it's also `NULL`. Use `IS NULL` and `IS NOT NULL` instead.

## Syntax
```
WHERE column IS NULL
WHERE column IS NOT NULL
```

## Examples

Patrons with no name logged (illegible in the guestbook):
```
SELECT visit_date, tab_cents FROM patrons WHERE name IS NULL
```

Patrons who did leave a legible name:
```
SELECT name FROM patrons WHERE name IS NOT NULL
```

## Why not `= NULL`?

Because `NULL = NULL` is `NULL`, which is not `true` — so rows wouldn't match. `IS NULL` is the only way to test for missingness.
```

`content/reference/string-functions.md`:

```markdown
---
concept: string-functions
title: String functions
introduced_in: 03-speakeasy
---

# String functions

SQL has a handful of functions that operate on text. A few common ones:

| Function | Returns | Example |
|---|---|---|
| `UPPER(s)` | string in uppercase | `UPPER('weni')` → `'WENI'` |
| `LOWER(s)` | string in lowercase | `LOWER('WENI')` → `'weni'` |
| `LENGTH(s)` | number of characters | `LENGTH('Weni')` → `4` |
| `SUBSTRING(s, start, n)` | n characters starting at `start` (1-indexed) | `SUBSTRING('Hayes', 2, 3)` → `'aye'` |
| `LEFT(s, n)` | first n characters | `LEFT('Hayes', 3)` → `'Hay'` |
| `RIGHT(s, n)` | last n characters | `RIGHT('Hayes', 3)` → `'yes'` |

## Use inside SELECT

```
SELECT UPPER(staff_name) FROM shifts
SELECT LENGTH(name), name FROM patrons WHERE name IS NOT NULL
```

## Use inside WHERE

```
SELECT * FROM patrons WHERE LENGTH(name) > 10
```
```

- [ ] **Step 4: Validate**

Run: `npm run validate-content`
Expected: still passes. (No Ch3 puzzles yet, so only schema check for Ch3's chapter.json runs.)

- [ ] **Step 5: Commit**

```bash
git add content/chapters/03-speakeasy/seed.sql content/chapters/03-speakeasy/chapter.json content/reference/order-by.md content/reference/like.md content/reference/is-null.md content/reference/string-functions.md
git commit -m "$(cat <<'EOF'
Add Chapter 3 seed, metadata, and reference markdown

Gladys Vance's speakeasy. Two tables (shifts 80 rows, patrons 120 rows).
Louise Hayes stops working after March 14. One patron that night left
no name — NULL in the guestbook. The shape of the mystery sits in that NULL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Chapter 3 puzzles 01–06

Six word-bank puzzles. Progression:
1. `ORDER BY ... ASC` — simple sort
2. `ORDER BY ... DESC LIMIT N` — top tabs
3. `WHERE LIKE 'Louise%'` — find Louise specifically
4. `WHERE name IS NULL` — the mystery guest
5. `LENGTH` / string function in SELECT or WHERE
6. Climax: combination — the full "find the mystery night" query

**Files:**
- Create: `content/chapters/03-speakeasy/puzzles/01.json` through `06.json`

- [ ] **Step 1: Puzzle 01 — ORDER BY ASC**

`content/chapters/03-speakeasy/puzzles/01.json`:

```json
{
  "id": "01",
  "concept": "order-by",
  "brief": {
    "speaker": "gladys",
    "text": "Here's my schedule, kid. Show me every shift in order, earliest first. Let me see the rhythm of the place before we go looking for what's wrong."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "staff_name, shift_date" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "shifts" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "blank",   "id": "col",  "mode": "word_bank",
      "options": ["shift_date", "staff_name", "role"] },
    { "type": "blank",   "id": "dir",  "mode": "word_bank",
      "options": ["ASC", "DESC"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT staff_name, shift_date FROM shifts ORDER BY shift_date ASC",
    "order_sensitive": true
  },
  "hints": [
    { "when": "different-values", "text": "Gladys: 'Order's off. Check which column you're sorting by and which direction.'" },
    { "when": "error",            "text": "Gladys: 'SQL spat an error. Both slots need to be filled before you can run.'" },
    { "when": "default",          "text": "Gladys: 'Ascending means earliest first. Which column has the dates?'" }
  ],
  "success": {
    "speaker": "gladys",
    "text": "That's the rhythm. Louise, Frank, Mavis, Esther. Every few nights. A tight little crew."
  }
}
```

- [ ] **Step 2: Puzzle 02 — ORDER BY DESC with LIMIT**

`content/chapters/03-speakeasy/puzzles/02.json`:

```json
{
  "id": "02",
  "concept": "order-by",
  "brief": {
    "speaker": "gladys",
    "text": "The five biggest tabs. Largest first. The regulars with the deepest pockets — or the newcomers with the shortest judgment."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "name, visit_date, tab_cents" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "patrons" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "blank",   "id": "col",  "mode": "word_bank",
      "options": ["tab_cents", "visit_date", "party_size"] },
    { "type": "blank",   "id": "dir",  "mode": "word_bank",
      "options": ["DESC", "ASC"] },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "blank",   "id": "n",    "mode": "word_bank",
      "options": ["5", "50", "500"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT name, visit_date, tab_cents FROM patrons ORDER BY tab_cents DESC LIMIT 5",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Gladys: 'Too many. I asked for the top five. Pick the right number.'" },
    { "when": "wrong_count_low",  "text": "Gladys: 'Too few. Top five exactly — not one, not fifty.'" },
    { "when": "different-values", "text": "Gladys: 'Right count, wrong order. Biggest tab first — that's DESC.'" },
    { "when": "default",          "text": "Gladys: 'Biggest tabs first, top five.'" }
  ],
  "success": {
    "speaker": "gladys",
    "text": "Look at that. Number one — 3400 cents. That's thirty four dollars. One party of one. On March 14. Someone drank a month's rent in a night. And I don't know their name."
  }
}
```

- [ ] **Step 3: Puzzle 03 — LIKE**

`content/chapters/03-speakeasy/puzzles/03.json`:

```json
{
  "id": "03",
  "concept": "like",
  "brief": {
    "speaker": "gladys",
    "text": "Pull every shift Louise worked. Her last name's Hayes but use a pattern — I want the whole name, first and last. Start with 'Louise' and a wildcard."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "staff_name, shift_date" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "shifts" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",  "mode": "word_bank",
      "options": ["staff_name", "role", "shift_date"] },
    { "type": "blank",   "id": "op",   "mode": "word_bank",
      "options": ["LIKE", "=", "!="] },
    { "type": "blank",   "id": "pat",  "mode": "word_bank",
      "options": ["'Louise%'", "'%Louise%'", "'Louise'"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT staff_name, shift_date FROM shifts WHERE staff_name LIKE 'Louise%'",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_low",  "text": "Gladys: 'Zero rows? The pattern needs a wildcard — the percent sign.'" },
    { "when": "error",            "text": "Gladys: 'Use LIKE with a pattern, not equals.'" },
    { "when": "default",          "text": "Gladys: 'LIKE plus a pattern that starts with Louise followed by anything.'" }
  ],
  "success": {
    "speaker": "gladys",
    "text": "Twenty shifts. Through February. Into March. Her last one was March 14. After that, nothing. She's gone."
  }
}
```

- [ ] **Step 4: Puzzle 04 — IS NULL**

`content/chapters/03-speakeasy/puzzles/04.json`:

```json
{
  "id": "04",
  "concept": "is-null",
  "brief": {
    "speaker": "gladys",
    "text": "Sometimes the guestbook entry is illegible. The ink was smudged or the hand was shaking. Those show up as NULL in my digitized version. Find every one of them."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "id, visit_date, tab_cents" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "patrons" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",  "mode": "word_bank",
      "options": ["name", "visit_date", "tab_cents"] },
    { "type": "blank",   "id": "op",   "mode": "word_bank",
      "options": ["IS NULL", "IS NOT NULL", "= NULL"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT id, visit_date, tab_cents FROM patrons WHERE name IS NULL",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Gladys: 'Too many. IS NULL — not IS NOT NULL.'" },
    { "when": "wrong_count_low",  "text": "Gladys: 'Too few. Something is off.'" },
    { "when": "error",            "text": "Gladys: 'Can't use equals with NULL. SQL has a special IS NULL operator for it.'" },
    { "when": "default",          "text": "Gladys: 'The name column, IS NULL. That one.'" }
  ],
  "success": {
    "speaker": "gladys",
    "text": "One row. March 14. 3400 cents. A party of one with no legible name. That's the night Louise stopped coming to work. You see it now. I see it now."
  }
}
```

- [ ] **Step 5: Puzzle 05 — String functions (LENGTH)**

`content/chapters/03-speakeasy/puzzles/05.json`:

```json
{
  "id": "05",
  "concept": "string-functions",
  "brief": {
    "speaker": "gladys",
    "text": "I want the length of every name in my book. Character count. Longer names are usually the full-commas-for-formality types. Short ones are nicknames or regulars. Compute the length of the name column alongside the name itself. Exclude the NULL entry."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "fn",  "mode": "word_bank",
      "options": ["LENGTH(name)", "UPPER(name)", "LEFT(name, 3)"] },
    { "type": "text",    "text": ", name" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "patrons" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "name" },
    { "type": "blank",   "id": "op",  "mode": "word_bank",
      "options": ["IS NOT NULL", "IS NULL", "= ''"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT LENGTH(name), name FROM patrons WHERE name IS NOT NULL",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Gladys: 'Too many rows — did you include the NULL row? We want to exclude it.'" },
    { "when": "wrong_count_low",  "text": "Gladys: 'Too few. All legible entries.'" },
    { "when": "different-values", "text": "Gladys: 'Values don't match. Are you computing the LENGTH or something else?'" },
    { "when": "default",          "text": "Gladys: 'LENGTH of the name column. And exclude NULLs.'" }
  ],
  "success": {
    "speaker": "gladys",
    "text": "Most names hover around 10 to 12 characters. First initial, comma, last name. Standard guestbook protocol. Now for the hard one."
  }
}
```

- [ ] **Step 6: Puzzle 06 — Combination (the reveal)**

`content/chapters/03-speakeasy/puzzles/06.json`:

```json
{
  "id": "06",
  "concept": "string-functions",
  "brief": {
    "speaker": "gladys",
    "text": "Last one. I want the names of anyone who was here on March 14 — the night Louise disappeared. Ordered by tab size, largest first. Legible names only. If the biggest spender that night has a name, I want to see it at the top. If they don't, I want to know that too."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "name, tab_cents" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "patrons" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "col",   "mode": "word_bank",
      "options": ["visit_date", "name", "tab_cents"] },
    { "type": "blank",   "id": "op",    "mode": "word_bank",
      "options": ["=", "!=", "<"] },
    { "type": "blank",   "id": "val",   "mode": "word_bank",
      "options": ["DATE '1927-03-14'", "'1927-03-14'", "1927"] },
    { "type": "text",    "text": "AND name" },
    { "type": "blank",   "id": "nullop","mode": "word_bank",
      "options": ["IS NOT NULL", "IS NULL", "= ''"] },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "text",    "text": "tab_cents" },
    { "type": "blank",   "id": "dir",   "mode": "word_bank",
      "options": ["DESC", "ASC"] }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT name, tab_cents FROM patrons WHERE visit_date = DATE '1927-03-14' AND name IS NOT NULL ORDER BY tab_cents DESC",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Gladys: 'You're including the NULL row. Filter it out too.'" },
    { "when": "wrong_count_low",  "text": "Gladys: 'Not enough patrons. Check the date filter.'" },
    { "when": "different-values", "text": "Gladys: 'Right people, wrong order. Biggest tab first.'" },
    { "when": "error",            "text": "Gladys: 'Dates need the DATE prefix and single quotes.'" },
    { "when": "default",          "text": "Gladys: 'March 14, legible names only, tabs descending.'" }
  ],
  "success": {
    "speaker": "gladys",
    "text": "Six people with names. Harriman, Dalton, Ingram, Pinto, McCready, Lawson. Regulars. And one NULL, which you already found. Someone walked in that night with no name for me to write. Drank 34 dollars. And Louise never came back. You've done your job, kid. The rest is mine to take to the coppers."
  }
}
```

- [ ] **Step 7: Validate**

Run: `npm run validate-content`
Expected: "Content valid: all chapters and puzzles pass."

- [ ] **Step 8: Commit**

```bash
git add content/chapters/03-speakeasy/puzzles/
git commit -m "$(cat <<'EOF'
Add Chapter 3 puzzles 01-06 (word-bank mode: ORDER BY, LIKE, IS NULL, string functions)

Progression: ASC sort, DESC+LIMIT top-5, LIKE pattern for Louise,
IS NULL surfaces the mystery guest, LENGTH string function, final
combination query confirms the March 14 anomaly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Tests + ship

### Task 7: Playwright smoke test for Chapter 3 (word-bank interaction)

**Files:**
- Modify: `tests/e2e-smoke.spec.js`

- [ ] **Step 1: Append Ch3 test**

```js
test('Chapter 3 word-bank puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '03-speakeasy',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  // Boss intro + Gladys brief
  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('schedule');

  // Word bank visible, chips present
  const chips = page.locator('.word-bank-chip');
  await expect(chips.first()).toBeVisible();

  // Two empty slots
  await expect(page.locator('.slot.empty')).toHaveCount(2);

  // Click 'shift_date' chip then 'ASC' chip
  await chips.filter({ hasText: 'shift_date' }).click();
  await chips.filter({ hasText: 'ASC' }).click();

  // Slots should now be filled
  await expect(page.locator('.slot.empty')).toHaveCount(0);
  await expect(page.locator('.slot.filled')).toHaveCount(2);

  // Run
  await page.locator('#run-btn').click();

  // Success bubble
  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});
```

- [ ] **Step 2: Run**

Run: `npm run test:e2e`
Expected: 4/4 pass (three from prior milestones + this new Ch3 test).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e-smoke.spec.js
git commit -m "$(cat <<'EOF'
Extend Playwright smoke to cover Chapter 3 word-bank interaction

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Update playtest checklist

**Files:**
- Modify: `docs/playtest-checklist.md`

- [ ] **Step 1: Append Ch3 section**

Insert after the existing "Chapter 2" block, before "Reference drawer — Chapter 2":

```markdown
## Chapter 3 — The Speakeasy Ledger (word-bank mode)

### Transition
- [ ] After finishing Ch2, the game auto-advances to Ch3 Puzzle 01.
- [ ] Mechanic changes: dropdowns are gone; dashed slots + a word bank below appear.

### Puzzle 01 (ORDER BY ASC)
- [ ] Two empty slots, five tokens in the bank (shift_date, staff_name, role, ASC, DESC).
- [ ] Clicking `shift_date` fills the first slot. Clicking the filled slot returns the token to the end of the bank.
- [ ] Correct answer (shift_date + ASC) returns 80 rows in chronological order. Success.

### Puzzle 02 (ORDER BY DESC + LIMIT)
- [ ] Top-5 by tab returns exactly 5 rows, largest first.
- [ ] Picking `ASC` instead of `DESC` triggers different-values hint.

### Puzzle 03 (LIKE 'Louise%')
- [ ] The `LIKE` operator in the op slot + `'Louise%'` in the pattern slot finds 20 rows.
- [ ] Picking `=` with `'Louise'` returns 0 rows and hints.

### Puzzle 04 (IS NULL)
- [ ] `name IS NULL` returns exactly 1 row: March 14, 3400 cents.
- [ ] Success text surfaces the connection to Louise's last shift.

### Puzzle 05 (LENGTH string function)
- [ ] `LENGTH(name)` with `IS NOT NULL` returns 119 rows (all but the null).
- [ ] Result table shows a length column alongside name.

### Puzzle 06 (Combination)
- [ ] Date filter + IS NOT NULL + ORDER BY tab_cents DESC returns 6 rows.
- [ ] Success text names the regulars + notes the anonymous guest.

## Reference drawer — Chapter 3
- [ ] Drawer shows 9 concepts.
- [ ] New entries (ORDER BY, LIKE, IS NULL, String functions) all render.
```

- [ ] **Step 2: Commit**

```bash
git add docs/playtest-checklist.md
git commit -m "$(cat <<'EOF'
Extend playtest checklist with Chapter 3 word-bank manual steps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Final verification + milestone-c1 tag

- [ ] **Step 1: Full test matrix**

```bash
npm test
npm run validate-content
npm run test:e2e
```

Expected:
- `npm test` — 73 passing (65 baseline + 8 new word-bank unit tests).
- `npm run validate-content` — "Content valid: all chapters and puzzles pass."
- `npm run test:e2e` — 4/4 pass.

- [ ] **Step 2: Tag**

```bash
git tag -a milestone-c1 -m "Milestone C1: word-bank renderer + Chapter 3 playable"
```

Do NOT push the tag.

---

## Definition of Done

- [ ] All 9 tasks checked off.
- [ ] `npm test` passes (73).
- [ ] `npm run validate-content` passes across Ch1/2/3.
- [ ] `npm run test:e2e` passes (4/4).
- [ ] `milestone-c1` tag created locally.

---

## Out of scope for Milestone C1

- Chapter 4 (real Parquet census data + COUNT/SUM/AVG/GROUP BY) — deferred to Milestone C2.
- Typing renderer (Milestone D).
- Drag-and-drop word bank interactions (clicks-only is enough for v1).
