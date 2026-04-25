# Chapter 6 Implementation Plan — The Reunion (season finale)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chapter 6, the Phase 1 season finale — six puzzles teaching `INNER JOIN`, table aliases, and 2- and 3-table joins, set at Chrono Consulting HQ. The combined finale query reveals Hemiunu's fifth engagement is at Chrono itself. Outro flags Phase 2 (DDSQL).

**Architecture:** Engine-light. Reuses the typing mechanic from Chapter 5 unchanged. Three new hand-authored tables in a single seed.sql (`chrono_clients`, `chrono_engagements`, `era_records`). Six puzzle JSON files. Two reference markdown docs. Wiring: append the chapter to `CHAPTER_ORDER` and `CONCEPTS_FOR_CHAPTER`. No security validator changes (INNER JOIN is plain `SELECT` syntax). No new speakers (Carol-only narration; she's already in `SPEAKERS`).

**Tech Stack:** Vanilla JS ES modules, Node 22 + DuckDB, `node --test` for unit tests, Playwright for E2E. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-25-chapter-6-reunion-design.md`

---

## File map

**Create:**
- `content/chapters/06-reunion/chapter.json` — chapter metadata
- `content/chapters/06-reunion/seed.sql` — three-table master ledger seed (~75 rows)
- `content/chapters/06-reunion/puzzles/01.json` through `06.json` — six puzzles
- `content/reference/inner-join.md` — INNER JOIN reference
- `content/reference/table-aliases.md` — table alias reference

**Modify:**
- `src/main.js` — append `'06-reunion'` to `CHAPTER_ORDER`
- `src/reference.js` — add `'06-reunion'` to `CONCEPTS_FOR_CHAPTER`
- `tests/e2e-smoke.spec.js` — add Chapter 6 Puzzle 01 walkthrough
- `docs/playtest-checklist.md` — append Chapter 6 section

---

## Task 1: Reference markdown — INNER JOIN

**Files:**
- Create: `content/reference/inner-join.md`

- [ ] **Step 1: Write the file**

Create `content/reference/inner-join.md`:

```markdown
# INNER JOIN

`INNER JOIN` combines rows from two tables that share a matching value in a column. Rows that don't match on both sides are excluded.

## Form

```sql
SELECT a.col, b.col
FROM table_a a
INNER JOIN table_b b ON a.shared_col = b.shared_col;
```

The `ON` clause specifies the matching condition. Rows in `table_a` without a partner in `table_b` are dropped — and vice versa.

## Notes

- "Inner" is the intersection — rows present in both sides of the match.
- Other join types (`LEFT JOIN`, `RIGHT JOIN`, `OUTER JOIN`) keep unmatched rows from one or both sides. Phase 1 covers `INNER JOIN` only.
- The `ON` clause can use any condition, not just equality. `INNER JOIN ... ON a.x > b.y` is valid; equality is just the most common.
- You can chain joins: `FROM a INNER JOIN b ON ... INNER JOIN c ON ...`. Each `ON` matches against the running result.
```

- [ ] **Step 2: Verify the file is readable**

Run: `cat content/reference/inner-join.md | head -3`
Expected: shows the `# INNER JOIN` heading.

- [ ] **Step 3: Commit**

```bash
git add content/reference/inner-join.md
git commit -m "docs(reference): add INNER JOIN reference markdown"
```

---

## Task 2: Reference markdown — table aliases

**Files:**
- Create: `content/reference/table-aliases.md`

- [ ] **Step 1: Write the file**

Create `content/reference/table-aliases.md`:

```markdown
# Table aliases

A table alias is a short name you give a table inside a single query. Aliases reduce typing and make multi-table joins readable.

## Form

```sql
SELECT e.era, c.name
FROM chrono_engagements e
INNER JOIN chrono_clients c ON e.client_id = c.client_id;
```

`e` is now an alias for `chrono_engagements` and `c` for `chrono_clients`. Use the aliases everywhere else in the query.

## Notes

- Aliases are required when joining a table to itself (a self-join), and when two tables share column names that would otherwise be ambiguous.
- The optional `AS` keyword (`FROM chrono_engagements AS e`) is purely stylistic. Most SQL writers omit it for tables.
- Once an alias is defined, the original table name can no longer be used in that query — `e.era`, not `chrono_engagements.era`.
- Pick aliases that are short but mnemonic: `e` for engagements, `c` for clients, `r` for records.
```

- [ ] **Step 2: Verify the file is readable**

Run: `cat content/reference/table-aliases.md | head -3`
Expected: shows the `# Table aliases` heading.

- [ ] **Step 3: Commit**

```bash
git add content/reference/table-aliases.md
git commit -m "docs(reference): add table-aliases reference markdown"
```

---

## Task 3: Chapter 6 seed data (master ledger)

Three tables hand-authored into a single `seed.sql`. Total ~75 rows. The data must satisfy the puzzle invariants:
- 5 Hemiunu engagements (one per prior chapter + Chrono HQ kicker)
- 4 decoy anomalies (other flagged engagements with non-Hemiunu names)
- Puzzle 04 (`WHERE anomaly_note IS NOT NULL`) returns exactly 9 rows
- Puzzle 06 (`WHERE c.name = 'Hemiunu' ORDER BY e.year`) returns exactly 5 rows, last row is year 2026 / Chrono HQ

**Files:**
- Create: `content/chapters/06-reunion/seed.sql`

- [ ] **Step 1: Create the chapter directory**

Run: `mkdir -p content/chapters/06-reunion/puzzles`
Expected: silent success.

- [ ] **Step 2: Write the seed**

Create `content/chapters/06-reunion/seed.sql`:

```sql
-- Chapter 6 seed: Chrono Consulting's master ledger.
-- Three tables — clients, engagements, era_records — that together let
-- the player JOIN their way to Hemiunu's full footprint across history.

CREATE TABLE chrono_clients (
  client_id      INT PRIMARY KEY,
  name           TEXT NOT NULL,
  home_era       TEXT,
  status         TEXT NOT NULL
);

INSERT INTO chrono_clients VALUES
  ( 1, 'Pharaoh Menkaure',          'Old Kingdom Egypt',     'archived'),
  ( 2, 'Marcus Aurelius Quintus',   'Roman Empire, 165 CE',  'flagged'),
  ( 3, 'Lugalbanda Stylus',         'Sumer, 2400 BCE',       'flagged'),
  ( 4, 'Wei Bingxue',               'Han Dynasty',           'archived'),
  ( 5, 'Sir Edmund Pelham',         'Tudor England, 1567',   'flagged'),
  ( 6, 'Lorenzo Vespucci',          'Florence, 1487',        'archived'),
  ( 7, 'Aroha Te Kahu',             'Aotearoa, 1620',        'active'),
  ( 8, 'Beatrice Coxley',           '19th c. railroad',      'flagged'),
  ( 9, 'Olusegun Akande',           'Songhai Empire',        'archived'),
  (10, 'Hemiunu',                   'Old Kingdom Egypt',     'flagged'),
  (11, 'Oldrich',                   '1347 Prague',           'archived'),
  (12, 'Cornelius Grayson',         '1890 New York',         'archived'),
  (13, 'Gladys Vance',              '1920s Chicago',         'archived'),
  (14, 'Ji-eun Park',               'Joseon Dynasty',        'active'),
  (15, 'Carol',                     'Chrono HQ',             'active');

CREATE TABLE chrono_engagements (
  engagement_id  INT PRIMARY KEY,
  client_id      INT NOT NULL,
  era            TEXT NOT NULL,
  year           INT NOT NULL,
  anomaly_note   TEXT
);

INSERT INTO chrono_engagements VALUES
  -- Hemiunu's 5 engagements (one per prior chapter + Chrono HQ).
  ( 1, 10, 'Old Kingdom Egypt',  -2519, 'Anomalous overseer mark on small grain delivery'),
  ( 2, 10, '1347 Prague',         1347, 'Tavern patron, weekly visits all year'),
  ( 3, 10, '1890 New York',       1890, 'Census entry with no borough recorded'),
  ( 4, 10, '1927 Chicago',        1927, 'Speakeasy patron, name initially illegible'),
  ( 5, 10, 'Chrono HQ',           2026, 'Unauthorized access to time-portal infrastructure'),
  -- 4 decoy anomalies (other flagged clients, none named Hemiunu).
  ( 6,  3, 'Sumer, 2400 BCE',    -2400, 'Tablet year-on-year totals do not reconcile'),
  ( 7,  2, 'Roman Empire',         165, 'Payment in counterfeit silver denarii'),
  ( 8,  5, 'Tudor England',       1567, 'Missing inventory of monastic plate'),
  ( 9,  8, '19th c. railroad',    1872, 'Temporal-displacement claim, unverifiable'),
  -- 21 normal engagements (anomaly_note IS NULL).
  (10,  1, 'Old Kingdom Egypt',  -2530, NULL),
  (11,  1, 'Old Kingdom Egypt',  -2515, NULL),
  (12, 11, '1347 Prague',         1346, NULL),
  (13, 11, '1347 Prague',         1348, NULL),
  (14, 12, '1890 New York',       1889, NULL),
  (15, 12, '1890 New York',       1891, NULL),
  (16, 13, '1920s Chicago',       1925, NULL),
  (17, 13, '1920s Chicago',       1928, NULL),
  (18,  4, 'Han Dynasty',          200, NULL),
  (19,  6, 'Florence',            1485, NULL),
  (20,  6, 'Florence',            1490, NULL),
  (21,  7, 'Aotearoa',            1620, NULL),
  (22,  9, 'Songhai Empire',      1500, NULL),
  (23,  9, 'Songhai Empire',      1520, NULL),
  (24, 14, 'Joseon Dynasty',      1700, NULL),
  (25, 14, 'Joseon Dynasty',      1720, NULL),
  (26, 15, 'Chrono HQ',           2024, NULL),
  (27, 15, 'Chrono HQ',           2025, NULL),
  (28,  4, 'Han Dynasty',          210, NULL),
  (29,  2, 'Roman Empire',         170, NULL),
  (30,  5, 'Tudor England',       1570, NULL);

CREATE TABLE era_records (
  record_id      INT PRIMARY KEY,
  engagement_id  INT NOT NULL,
  detail         TEXT NOT NULL,
  location       TEXT,
  payment        TEXT
);

INSERT INTO era_records VALUES
  -- Hemiunu's 5 records — the chapter's narrative payoff.
  ( 1,  1, 'Overseer''s mark on small grain delivery — 420 units, year 9 of Menkaure', 'Saqqara',         'old coin'),
  ( 2,  2, 'Tavern patron, 52 weekly Wednesday visits, never aged',                    'Mala Strana',     'old coin'),
  ( 3,  3, 'Census entry id 3000 — no borough, no occupation recorded',                'unknown',         'none'),
  ( 4,  4, 'Speakeasy patron, March 14, $34 tab, name initially illegible',            'Hemlock Room',    'unmarked bills'),
  ( 5,  5, 'Unauthorized access to time-portal infrastructure',                        'internal',        '—'),
  -- Decoy anomaly details.
  ( 6,  6, 'Granary tablets show grain balances drifting upward year-over-year',       'Ur',              'silver shekels'),
  ( 7,  7, 'Counterfeit denarii — copper core under silver wash',                      'Ostia',           'counterfeit denarii'),
  ( 8,  8, 'Inventory of plate from three monasteries went unrecorded post-dissolution','Suffolk',        'crown bond'),
  ( 9,  9, 'Surveyor claimed to have walked four miles ahead of the rail line',        'Wyoming territory','company scrip'),
  -- Normal engagement details.
  (10, 10, 'Royal granary capacity audit, prep for next harvest',                      'Memphis',         'gold ring-money'),
  (11, 11, 'Scribal training program for junior accountants',                          'Memphis',         'gold ring-money'),
  (12, 12, 'Tax records reconciliation pre-plague',                                    'Mala Strana',     'groschen'),
  (13, 13, 'Tax records reconciliation post-plague',                                   'Mala Strana',     'groschen'),
  (14, 14, 'Population projection for new ward planning',                              'Lower Manhattan', 'gold dollars'),
  (15, 15, 'Demographic follow-up survey for charitable outreach',                     'Five Points',     'gold dollars'),
  (16, 16, 'Legal advisory on supplier contracts',                                     'Loop',            'cashier''s checks'),
  (17, 17, 'Financial reconciliation for liquor procurement',                          'Loop',            'cashier''s checks'),
  (18, 18, 'Provincial tribute accounting',                                            'Chang''an',       'wuzhu coins'),
  (19, 19, 'Bookkeeping for cloth-merchant guild',                                     'Mercato Vecchio', 'florins'),
  (20, 20, 'Estate inventory for Vespucci heirs',                                      'Mercato Vecchio', 'florins'),
  (21, 21, 'Trade records for harakeke export',                                        'Tāmaki Makaurau', 'pounamu (in kind)'),
  (22, 22, 'Salt-trade ledger reconciliation',                                         'Timbuktu',        'gold dust'),
  (23, 23, 'Manuscript inventory at the Sankore library',                              'Timbuktu',        'gold dust'),
  (24, 24, 'Royal granary audit prep',                                                 'Hanseong',        'sangpyeong tongbo'),
  (25, 25, 'Court ledger reconciliation',                                              'Hanseong',        'sangpyeong tongbo'),
  (26, 26, 'Internal expense reconciliation, Q3',                                      'internal',        '—'),
  (27, 27, 'Time-portal fuel budget review',                                           'internal',        '—'),
  (28, 28, 'Imperial postal reconciliation',                                           'Chang''an',       'wuzhu coins'),
  (29, 29, 'Senatorial estate audit',                                                  'Ostia',           'silver denarii'),
  (30, 30, 'Court advisor expenses for the Privy Council',                             'London',          'sovereigns');
```

- [ ] **Step 3: Verify the seed loads and produces the expected row counts**

```bash
node -e "
import('@duckdb/node-api').then(async ({ DuckDBInstance }) => {
  const inst = await DuckDBInstance.create(':memory:');
  const conn = await inst.connect();
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync('content/chapters/06-reunion/seed.sql', 'utf8');
  const ex = await conn.extractStatements(sql);
  for (let i = 0; i < ex.count; i++) await (await ex.prepare(i)).run();
  const r1 = await conn.runAndReadAll('SELECT COUNT(*) FROM chrono_clients');
  const r2 = await conn.runAndReadAll('SELECT COUNT(*) FROM chrono_engagements');
  const r3 = await conn.runAndReadAll('SELECT COUNT(*) FROM era_records');
  const r4 = await conn.runAndReadAll('SELECT COUNT(*) FROM chrono_engagements WHERE anomaly_note IS NOT NULL');
  const r5 = await conn.runAndReadAll(\"SELECT e.era, e.year FROM chrono_engagements e INNER JOIN chrono_clients c ON e.client_id = c.client_id WHERE c.name = 'Hemiunu' ORDER BY e.year\");
  console.log('clients:', r1.getRows()[0][0].toString());
  console.log('engagements:', r2.getRows()[0][0].toString());
  console.log('era_records:', r3.getRows()[0][0].toString());
  console.log('anomalies:', r4.getRows()[0][0].toString());
  console.log('hemiunu rows ordered:');
  for (const row of r5.getRows()) console.log('  ', row[0], row[1].toString());
});
"
```

Expected:
```
clients: 15
engagements: 30
era_records: 30
anomalies: 9
hemiunu rows ordered:
   Old Kingdom Egypt -2519
   1347 Prague 1347
   1890 New York 1890
   1927 Chicago 1927
   Chrono HQ 2026
```

If any count is off, the seed has a typo. Re-check the INSERT blocks against the spec table before continuing.

- [ ] **Step 4: Commit**

```bash
git add content/chapters/06-reunion/seed.sql
git commit -m "feat(content): add Chapter 6 master-ledger seed (clients, engagements, era_records)"
```

---

## Task 4: Chapter 6 metadata (chapter.json)

**Files:**
- Create: `content/chapters/06-reunion/chapter.json`

- [ ] **Step 1: Write chapter.json**

Create `content/chapters/06-reunion/chapter.json` with this exact content:

```json
{
  "id": "06-reunion",
  "ordinal": 6,
  "title": "The Reunion",
  "era": "Chrono Consulting HQ, present day",
  "client": {
    "name": "Carol",
    "portrait": "carol.svg",
    "voice": "wry, tired, weirdly protective"
  },
  "boss_intro": "Carol is at the desk when you walk in. The desk is covered in ledgers. Five of them. Old Kingdom, Prague, New York, Chicago, and one binder you don't recognize. 'I had records pull everything. Every chapter we've worked, every engagement we've billed for. The firm has been around longer than I have. The ledgers don't always agree.' She doesn't sit down. 'I want to put them in the same shape. Then I want to see who's in all of them. Try not to flinch.' The mechanic is the same as Oldrich's. Type the queries. The firm doesn't do forms with neat little boxes for its own books either.",
  "concepts_introduced": ["inner-join", "table-aliases"],
  "concepts_reviewed": ["distinct", "having", "date-functions", "group-by", "where"],
  "mechanic_mode": "typing",
  "arc_hook": "Carol pulled every ledger from records. Same desk, five eras. The firm has been around longer than anyone alive — and the ledgers don't always agree.",
  "puzzle_ids": ["01", "02", "03", "04", "05", "06"],
  "outro": "Carol picks up the phone. The line rings once and clicks dead. She tries another. Same. 'Telecom's down too.' She looks at the clock. 'Internet — I had three dashboards open this morning. They're all blank.' She puts the phone back in its cradle, gentle. 'He cut the observability before he left. We can't see the building from inside the building.' A long beat. She walks over to the window — and pulls the blinds. 'Get yourself a coffee. The CEO's flying back. When she lands, she's going to want someone in this room who can read a query. That's you now.' Then, quieter, almost to herself: 'Welcome to Phase Two.'"
}
```

- [ ] **Step 2: Commit**

```bash
git add content/chapters/06-reunion/chapter.json
git commit -m "feat(content): add Chapter 6 metadata"
```

---

## Task 5: Puzzle 01 — "What we have"

**Files:**
- Create: `content/chapters/06-reunion/puzzles/01.json`

- [ ] **Step 1: Write the puzzle**

Create `content/chapters/06-reunion/puzzles/01.json`:

```json
{
  "id": "01",
  "concept": "select",
  "brief": {
    "speaker": "carol",
    "text": "Start with our engagement ledger. I want to see the first ten rows. Just so we know what we're looking at."
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
    "sql": "SELECT engagement_id, client_id, era, year, anomaly_note FROM chrono_engagements LIMIT 10",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Ten rows. I said ten.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'I asked for ten. Show me ten.'" },
    { "when": "error",            "text": "Carol: 'The table is called chrono_engagements. Plural.'" },
    { "when": "default",          "text": "Carol: 'Pick the columns you want. Name the table. Ten rows.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Carol nods. 'Right. Era, year, client_id. That id refers to a name on the client roster, but you have to ask the roster for it.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `npm run validate-content`
Expected: `Content valid: all chapters and puzzles pass.`

- [ ] **Step 3: Commit**

```bash
git add content/chapters/06-reunion/puzzles/01.json
git commit -m "feat(chapter-6): add puzzle 01 — engagement ledger refresher"
```

---

## Task 6: Puzzle 02 — first INNER JOIN

**Files:**
- Create: `content/chapters/06-reunion/puzzles/02.json`

- [ ] **Step 1: Write the puzzle**

Create `content/chapters/06-reunion/puzzles/02.json`:

```json
{
  "id": "02",
  "concept": "inner-join",
  "brief": {
    "speaker": "carol",
    "text": "Join the engagements to our client roster on client_id. I want a name next to every engagement, not a number. Use INNER JOIN — the table is chrono_clients, the matching column is client_id on both sides. Take the first ten rows."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "chrono_engagements.era, chrono_engagements.year, chrono_clients.name" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "chrono_engagements" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "blank",   "id": "tbl", "mode": "typed", "placeholder": "table to join" },
    { "type": "keyword", "text": "ON" },
    { "type": "blank",   "id": "cond","mode": "typed", "placeholder": "join condition" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "text",    "text": "10" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT chrono_engagements.era, chrono_engagements.year, chrono_clients.name FROM chrono_engagements INNER JOIN chrono_clients ON chrono_engagements.client_id = chrono_clients.client_id LIMIT 10",
    "order_sensitive": false
  },
  "hints": [
    { "when": "error",   "text": "Carol: 'INNER JOIN takes a table name first, then ON, then the matching condition. Look at the reference if you've forgotten the shape.'" },
    { "when": "default", "text": "Carol: 'chrono_clients on the right. Match client_id to client_id. Both sides need the table name.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Carol exhales. 'Good. We can read it now.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `npm run validate-content`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add content/chapters/06-reunion/puzzles/02.json
git commit -m "feat(chapter-6): add puzzle 02 — first INNER JOIN"
```

---

## Task 7: Puzzle 03 — table aliases

**Files:**
- Create: `content/chapters/06-reunion/puzzles/03.json`

- [ ] **Step 1: Write the puzzle**

Create `content/chapters/06-reunion/puzzles/03.json`:

```json
{
  "id": "03",
  "concept": "table-aliases",
  "brief": {
    "speaker": "carol",
    "text": "Same query as before. But name the engagements table 'e' and the clients table 'c'. Use those aliases everywhere. SQL was designed by people who hated typing."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "blank",   "id": "cols", "mode": "typed", "placeholder": "use the aliases" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "chrono_engagements e" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "text",    "text": "chrono_clients c" },
    { "type": "keyword", "text": "ON" },
    { "type": "blank",   "id": "cond", "mode": "typed", "placeholder": "join condition with aliases" },
    { "type": "keyword", "text": "LIMIT" },
    { "type": "text",    "text": "10" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT e.era, e.year, c.name FROM chrono_engagements e INNER JOIN chrono_clients c ON e.client_id = c.client_id LIMIT 10",
    "order_sensitive": false
  },
  "hints": [
    { "when": "error",   "text": "Carol: 'Once an alias is defined, the long table name doesn''t work anymore. e.era, c.name, etc.'" },
    { "when": "default", "text": "Carol: 'e for engagements. c for clients. Use them everywhere.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Carol nods. 'Better. You'll do this a lot. Get comfortable with it.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `npm run validate-content`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add content/chapters/06-reunion/puzzles/03.json
git commit -m "feat(chapter-6): add puzzle 03 — table aliases"
```

---

## Task 8: Puzzle 04 — JOIN with WHERE

**Files:**
- Create: `content/chapters/06-reunion/puzzles/04.json`

- [ ] **Step 1: Write the puzzle**

Create `content/chapters/06-reunion/puzzles/04.json`:

```json
{
  "id": "04",
  "concept": "inner-join",
  "brief": {
    "speaker": "carol",
    "text": "Now show me only the engagements someone flagged. The anomaly_note column is NULL for normal cases. Filter those out. Keep the join, keep the aliases."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "e.era, e.year, c.name, e.anomaly_note" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "chrono_engagements e" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "text",    "text": "chrono_clients c" },
    { "type": "keyword", "text": "ON" },
    { "type": "text",    "text": "e.client_id = c.client_id" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "cond", "mode": "typed", "placeholder": "anomaly condition" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT e.era, e.year, c.name, e.anomaly_note FROM chrono_engagements e INNER JOIN chrono_clients c ON e.client_id = c.client_id WHERE e.anomaly_note IS NOT NULL",
    "order_sensitive": false
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'You're including normal engagements. The anomaly_note column tells you which is which.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'Too few. We should have nine flagged engagements.'" },
    { "when": "error",            "text": "Carol: 'IS NOT NULL — three keywords. The 'is not equal' operator doesn't work for NULL.'" },
    { "when": "default",          "text": "Carol: 'Filter where the anomaly_note is not NULL.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Carol pulls a chair over. She runs her finger down the names column. 'Nine entries. Five — that's the same name. Five different rows, same name.' She lets it sit."
  }
}
```

- [ ] **Step 2: Validate**

Run: `npm run validate-content`
Expected: pass. Result is exactly 9 rows.

- [ ] **Step 3: Commit**

```bash
git add content/chapters/06-reunion/puzzles/04.json
git commit -m "feat(chapter-6): add puzzle 04 — JOIN with WHERE filter"
```

---

## Task 9: Puzzle 05 — three-table JOIN

**Files:**
- Create: `content/chapters/06-reunion/puzzles/05.json`

- [ ] **Step 1: Write the puzzle**

Create `content/chapters/06-reunion/puzzles/05.json`:

```json
{
  "id": "05",
  "concept": "inner-join",
  "brief": {
    "speaker": "carol",
    "text": "Add the third table — era_records. Each engagement has one. The detail column is what someone wrote down at the time. Join on engagement_id. Use 'r' as the alias. Keep the anomaly filter."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "e.era, e.year, c.name, r.detail, r.location" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "chrono_engagements e" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "text",    "text": "chrono_clients c" },
    { "type": "keyword", "text": "ON" },
    { "type": "text",    "text": "e.client_id = c.client_id" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "blank",   "id": "third", "mode": "typed", "placeholder": "third table with alias" },
    { "type": "keyword", "text": "ON" },
    { "type": "blank",   "id": "cond",  "mode": "typed", "placeholder": "match on engagement_id" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "text",    "text": "e.anomaly_note IS NOT NULL" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT e.era, e.year, c.name, r.detail, r.location FROM chrono_engagements e INNER JOIN chrono_clients c ON e.client_id = c.client_id INNER JOIN era_records r ON r.engagement_id = e.engagement_id WHERE e.anomaly_note IS NOT NULL",
    "order_sensitive": false
  },
  "hints": [
    { "when": "error",   "text": "Carol: 'Second join takes era_records — alias it r. Match r.engagement_id to e.engagement_id.'" },
    { "when": "default", "text": "Carol: 'INNER JOIN era_records r ON r.engagement_id = e.engagement_id. Same shape as the first join.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Carol slides her finger across the new columns. 'Saqqara. Mala Strana. The Hemlock Room. Census three thousand.' She pauses on a fifth detail. 'Internal.' She doesn't comment further. 'Pull just his rows next, oldest first.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `npm run validate-content`
Expected: pass. Result is 9 rows (the same nine anomalies, now with detail/location).

- [ ] **Step 3: Commit**

```bash
git add content/chapters/06-reunion/puzzles/05.json
git commit -m "feat(chapter-6): add puzzle 05 — three-table JOIN"
```

---

## Task 10: Puzzle 06 — the reunion (Hemiunu reveal)

**Files:**
- Create: `content/chapters/06-reunion/puzzles/06.json`

- [ ] **Step 1: Write the puzzle**

Create `content/chapters/06-reunion/puzzles/06.json`:

```json
{
  "id": "06",
  "concept": "inner-join",
  "brief": {
    "speaker": "carol",
    "text": "Filter to just Hemiunu — that name in the clients table. Order by year. Oldest first. I want the whole story end to end."
  },
  "template": [
    { "type": "keyword", "text": "SELECT" },
    { "type": "text",    "text": "e.era, e.year, r.detail, r.location, r.payment" },
    { "type": "keyword", "text": "FROM" },
    { "type": "text",    "text": "chrono_engagements e" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "text",    "text": "chrono_clients c" },
    { "type": "keyword", "text": "ON" },
    { "type": "text",    "text": "e.client_id = c.client_id" },
    { "type": "keyword", "text": "INNER JOIN" },
    { "type": "text",    "text": "era_records r" },
    { "type": "keyword", "text": "ON" },
    { "type": "text",    "text": "r.engagement_id = e.engagement_id" },
    { "type": "keyword", "text": "WHERE" },
    { "type": "blank",   "id": "filter", "mode": "typed", "placeholder": "name = Hemiunu" },
    { "type": "keyword", "text": "ORDER BY" },
    { "type": "blank",   "id": "order",  "mode": "typed", "placeholder": "chronological" }
  ],
  "expected": {
    "method": "rows",
    "sql": "SELECT e.era, e.year, r.detail, r.location, r.payment FROM chrono_engagements e INNER JOIN chrono_clients c ON e.client_id = c.client_id INNER JOIN era_records r ON r.engagement_id = e.engagement_id WHERE c.name = 'Hemiunu' ORDER BY e.year",
    "order_sensitive": true
  },
  "hints": [
    { "when": "wrong_count_high", "text": "Carol: 'Too many. Filter to just Hemiunu — match c.name.'" },
    { "when": "wrong_count_low",  "text": "Carol: 'You found nobody. Single quotes around the name.'" },
    { "when": "different-values", "text": "Carol: 'Right rows, wrong order. Oldest first. e.year ascending.'" },
    { "when": "error",            "text": "Carol: 'Single quotes around Hemiunu. Order by e.year — that's the column on the engagements table.'" },
    { "when": "default",          "text": "Carol: 'WHERE c.name = the name. ORDER BY e.year. Five rows in chronological order.'" }
  ],
  "success": {
    "speaker": "carol",
    "text": "Carol reads down the list. Two and a half thousand BCE. 1347. 1890. 1927. And then she stops. 'Twenty twenty-six. Chrono HQ.' She doesn't read the rest aloud. 'We're not chasing him through history. He's been in our basement the entire time.'"
  }
}
```

- [ ] **Step 2: Validate**

Run: `npm run validate-content`
Expected: pass. Result is exactly 5 rows, ordered by year ascending. Last row's era is "Chrono HQ", year 2026.

- [ ] **Step 3: Commit**

```bash
git add content/chapters/06-reunion/puzzles/06.json
git commit -m "feat(chapter-6): add puzzle 06 — Hemiunu reunion (season finale)"
```

---

## Task 11: Wire chapter 6 into CHAPTER_ORDER and reference concepts

**Files:**
- Modify: `src/main.js`
- Modify: `src/reference.js`

- [ ] **Step 1: Append `'06-reunion'` to `CHAPTER_ORDER` in `src/main.js`**

Find the line that currently reads:
```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern'];
```

Replace with:
```js
const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern', '06-reunion'];
```

- [ ] **Step 2: Add `'06-reunion'` entry to `CONCEPTS_FOR_CHAPTER` in `src/reference.js`**

Add this entry inside the `CONCEPTS_FOR_CHAPTER` object, after the `'05-tavern'` block:

```js
  '06-reunion': [
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
    { slug: 'inner-join', title: 'INNER JOIN' },
    { slug: 'table-aliases', title: 'Table aliases' },
  ],
```

- [ ] **Step 3: Run all unit tests to confirm nothing broke**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke — boot the server and verify the chapter loads**

Run: `npm start &` (note PID), then open `http://localhost:5173/`. Confirm:
- Chapter 6 is reachable (auto-advance from Ch 5 final puzzle, or via dev shortcut / state plant).
- Carol's boss intro renders on Chapter 6.
- The reference drawer has 13 entries including INNER JOIN and Table aliases at the bottom.

Stop the server when done.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/reference.js
git commit -m "feat: wire Chapter 6 into CHAPTER_ORDER and reference concepts"
```

---

## Task 12: Playwright smoke test for Chapter 6 Puzzle 01

**Files:**
- Modify: `tests/e2e-smoke.spec.js`

- [ ] **Step 1: Append a Chapter 6 walkthrough**

In `tests/e2e-smoke.spec.js`, append after the existing Chapter 5 test:

```js
test('Chapter 6 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '06-reunion',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('engagement ledger');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(2);

  await inputs.nth(0).fill('engagement_id, client_id, era, year, anomaly_note');
  await inputs.nth(1).fill('chrono_engagements');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});
```

- [ ] **Step 2: Run the E2E suite**

```bash
npm start &
SERVER_PID=$!
sleep 3
npm run test:e2e
TEST_EXIT=$?
kill $SERVER_PID
exit $TEST_EXIT
```

Expected: all E2E tests pass, including the new Chapter 6 test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e-smoke.spec.js
git commit -m "test(e2e): add Chapter 6 Puzzle 01 smoke walkthrough"
```

---

## Task 13: Manual playtest checklist — Chapter 6

**Files:**
- Modify: `docs/playtest-checklist.md`

- [ ] **Step 1: Append a Chapter 6 section**

In `docs/playtest-checklist.md`, find the `## Reference drawer — Chapter 5` block. Insert this Chapter 6 section immediately before the existing `## Security spot-check` heading:

```markdown
## Chapter 6 — The Reunion (typing mode, season finale)

### Boot & navigation
- [ ] Solving Chapter 5 Puzzle 06 auto-advances to Chapter 6; OR set localStorage state to land directly.
- [ ] Carol's boss intro renders, mentioning the five ledgers on the desk and the parchment-and-candle-style mechanic.
- [ ] Progress indicator shows Chapter 6.

### Mechanic — typing (regression check)
- [ ] All Chapter 6 puzzles render text inputs (not dropdowns, not word-bank chips).
- [ ] Run button is disabled until every blank has at least one character.

### Per-puzzle correctness
- [ ] **Puzzle 01:** Type `engagement_id, client_id, era, year, anomaly_note` and `chrono_engagements`. Submit. Carol's success copy appears.
- [ ] **Puzzle 02:** Type `chrono_clients` and `chrono_engagements.client_id = chrono_clients.client_id`. Submit. Result has 10 rows with names attached.
- [ ] **Puzzle 03:** Type `e.era, e.year, c.name` and `e.client_id = c.client_id`. Submit. Result is 10 rows, same as puzzle 02 but using aliases.
- [ ] **Puzzle 04:** Type `e.anomaly_note IS NOT NULL`. Submit. Result is exactly 9 rows. Carol's success copy mentions the same name appearing five times.
- [ ] **Puzzle 04 wrong path:** Type `e.anomaly_note != NULL`. Submit. Error hint about IS NOT NULL fires.
- [ ] **Puzzle 05:** Type `era_records r` and `r.engagement_id = e.engagement_id`. Submit. Result is 9 rows with detail and location.
- [ ] **Puzzle 06:** Type `c.name = 'Hemiunu'` and `e.year`. Submit. Result is exactly 5 rows in chronological order, last row is `Chrono HQ` / `2026`. Carol's success copy lands the "in our basement the entire time" line.
- [ ] **Puzzle 06 wrong path:** Type `c.name = 'Hemiunu'` and `e.year DESC`. Different-values hint fires (right rows, wrong order).

### Reference drawer
- [ ] Drawer shows 13 concepts on Chapter 6, with INNER JOIN and Table aliases at the bottom.
- [ ] INNER JOIN and Table aliases both load and render markdown without error.

### Outro / Phase 2 stinger
- [ ] After solving Puzzle 06, the outro fires.
- [ ] Carol's outro mentions the dead phone lines, the blank dashboards, and pulling the blinds.
- [ ] The line "Welcome to Phase Two" renders.

### Browser compat
- [ ] All of the above passes in Chrome.
- [ ] All of the above passes in Safari.
```

- [ ] **Step 2: Commit**

```bash
git add docs/playtest-checklist.md
git commit -m "docs: extend playtest checklist with Chapter 6 manual steps"
```

---

## Task 14: Final integration sweep

After all prior tasks, do a full verification pass before declaring Chapter 6 shipped.

- [ ] **Step 1: Run the full test suite**

```bash
npm test && npm run validate-content
```

Expected: all unit tests pass, content validator reports all 30 puzzles (across chapters 1–6) pass their expected SQL against their seeds.

- [ ] **Step 2: Run the E2E smoke**

```bash
npm start &
SERVER_PID=$!
sleep 3
npm run test:e2e
kill $SERVER_PID
```

Expected: all Playwright tests pass (including the new Chapter 6 test from Task 12).

- [ ] **Step 3: One full manual playthrough of Chapter 6**

Walk all six puzzles in order in a real browser. Spot-check the dialogue lands as a story, especially the puzzle 04 → 05 → 06 escalation (same-name-five-times → era details with the "Internal" beat → chronological reveal terminating at 2026).

- [ ] **Step 4: Verify no untracked or modified files lurk**

Run: `git status --short`
Expected: clean. If anything shows up, investigate before declaring done.

- [ ] **Step 5: Optional — tag the milestone**

```bash
git tag milestone-e-chapter-6
```

(Matches the `milestone-c2` and `milestone-d-chapter-5` tag pattern.)

---

## Self-review notes

Spec coverage check:
- Mechanic (typing reuse, no engine change) — confirmed implicit in Tasks 5–10 (no engine modifications) ✓
- Three-table data model with hand-authored seed — Task 3 ✓
- 6-puzzle arc covering INNER JOIN, table aliases, 2- and 3-table joins, finale — Tasks 5–10 ✓
- Narrative draft (cold open, per-puzzle, outro) — Tasks 4 (cold open + outro), 5–10 (per-puzzle) ✓
- Two new reference docs (inner-join, table-aliases) — Tasks 1, 2 ✓
- Wiring (CHAPTER_ORDER, CONCEPTS_FOR_CHAPTER, no new speaker) — Task 11 ✓
- Tests — Playwright smoke + content validator (auto) + manual checklist — Tasks 12, 13, plus implicit validator in 5–10 ✓

Spec's three open questions:
- Hemiunu's `client_id` value — Task 3 chose `10` (mid-table, unmemorable). Resolved.
- Hand-authored vs generated seed — Task 3 chose hand-authored (full SQL inline). Resolved.
- Decoy `anomaly_note` text — Task 3 picked four era-flavored decoys (counterfeit denarii, Sumerian tablet inconsistencies, Tudor monastic plate, 19th-century railroad displacement claim). Resolved.

No placeholders, no TBDs. All code blocks are complete and runnable.
