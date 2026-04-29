# Milestone A Playtest Checklist

Run through this list manually before declaring Milestone A shippable. Expected to take ~15 minutes.

## Setup
- [ ] Fresh browser / incognito. Or: `localStorage.clear()` in devtools.
- [ ] Open http://localhost:5173.
- [ ] Page loads in under 2s. No console errors.

## Chapter 1 — Onboarding

### Puzzle 01 (SELECT one column)
- [ ] Carol's boss-intro bubble appears.
- [ ] Client brief bubble appears.
- [ ] Two dropdowns visible.
- [ ] "Run query" disabled until both dropdowns filled.
- [ ] Wrong answer (e.g. `id` + `clients`) shows hint bubble.
- [ ] Correct answer shows success bubble. Next button appears.
- [ ] Results table shows 20 rows with 1 column (`name`).

### Puzzle 02 (SELECT two columns)
- [ ] Next button advances to puzzle 02.
- [ ] Brief bubble appears.
- [ ] Correct answer shows success.

### Puzzle 03 (SELECT *)
- [ ] The "all"/"everything" options cause DuckDB error → hint.
- [ ] `*` produces a wide table with 6 columns.

### Puzzle 04 (LIMIT)
- [ ] 3 rows shown when LIMIT 3 selected.
- [ ] 10, 20, 100 all trigger wrong-count hints appropriately.

### Puzzle 05 (WHERE preview)
- [ ] LIKE produces results on the '???' row (DuckDB LIKE matches '???' literally).
- [ ] `>` produces wrong type comparison or 0 rows → hint.
- [ ] `=` produces 1 row — the '???' row. Success.

## Reference drawer
- [ ] 📖 Reference button in appbar opens drawer.
- [ ] Drawer shows SELECT, FROM, LIMIT tabs.
- [ ] Clicking each renders its markdown content.
- [ ] Escape and click-outside both close the drawer.

## Persistence
- [ ] Solve puzzles 1–2. Reload the page.
- [ ] Game resumes at puzzle 3 (no repetition of 1–2).
- [ ] `localStorage.chronoConsultingState-v1` contains solved list.

## Chapter 2 — The Pharaoh's Grain Audit

### Transition
- [ ] After solving Ch1 Puzzle 05 and clicking Next, Carol's outro bubble appears and the UI auto-advances to Ch2 Puzzle 01 (Pharaoh Menkaure's brief shows up).
- [ ] No stale Run/Next buttons left over from Ch1.

### Puzzle 01 (WHERE with text equality)
- [ ] Pharaoh's brief names Weni.
- [ ] Three dropdowns: column, operator, value.
- [ ] Correct query (`overseer = 'Weni'`) returns ~15 rows. Success.
- [ ] Wrong column (e.g. `silo`) returns 0 rows — wrong_count_low hint.

### Puzzle 02 (WHERE with integer — Hemiunu surfaces)
- [ ] Brief mentions year 9 + "a feeling."
- [ ] Correct query returns 6 rows. Hemiunu/420 is among them.
- [ ] Success text explicitly names Hemiunu for the first time.
- [ ] Picking `'9'` (quoted string) triggers the type-mismatch hint.

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

## Chapter 3 — The Speakeasy Ledger (word-bank mode)

### Transition
- [ ] After finishing Ch2 Puzzle 06, clicking Next plays Menkaure's outro, then the game auto-advances to Ch3 Puzzle 01.
- [ ] Mechanic visibly changes: dropdowns are gone; dashed slots appear inline in the query, a word bank chip row appears below.

### Puzzle 01 (ORDER BY ASC)
- [ ] Gladys's brief mentions "schedule" and "rhythm".
- [ ] Two empty slots, five tokens in the bank (shift_date, staff_name, role, ASC, DESC).
- [ ] Clicking `shift_date` fills the first slot and the chip disappears from the bank.
- [ ] Clicking the filled slot returns the token to the end of the bank.
- [ ] Correct answer (shift_date + ASC) returns 80 rows in chronological order. Success.

### Puzzle 02 (ORDER BY DESC + LIMIT)
- [ ] Top-5 by tab returns exactly 5 rows, largest first. Row 1 should show a NULL name (or empty), 3400 cents.
- [ ] Picking `ASC` instead of `DESC` triggers different-values hint.

### Puzzle 03 (LIKE 'Louise%')
- [ ] `LIKE` + `'Louise%'` finds 20 rows — Louise Hayes's shifts.
- [ ] Picking `=` with `'Louise'` returns 0 rows and triggers wrong_count_low hint.

### Puzzle 04 (IS NULL)
- [ ] `name IS NULL` returns exactly 1 row: March 14, 3400 cents.
- [ ] Success text surfaces the connection to Louise's last shift.

### Puzzle 05 (LENGTH string function)
- [ ] `LENGTH(name)` with `IS NOT NULL` returns 119 rows.
- [ ] Result table has a length column alongside the name column.

### Puzzle 06 (Combination)
- [ ] Date filter + IS NOT NULL + ORDER BY tab_cents DESC returns 6 rows.
- [ ] Success text names the regulars (Harriman, Dalton, Ingram, Pinto, McCready, Lawson).
- [ ] Gladys's final line talks about taking it to the coppers.

## Reference drawer — Chapter 3
- [ ] Drawer shows 9 concepts: SELECT, FROM, LIMIT, WHERE, Comparison ops, ORDER BY, LIKE, IS NULL, String functions.
- [ ] New entries (ORDER BY, LIKE, IS NULL, String functions) all render.
- [ ] Switching between Ch2 and Ch3 reference content works (aria-current updates).

## Chapter 4 — The Robber Baron's Census (aggregation + GROUP BY)

### Transition
- [ ] After finishing Ch3, the game auto-advances to Ch4 Puzzle 01.
- [ ] First-load delay: the chapter's seed.sql loads ~3000 rows from the CSV. Under ~2 seconds. No visible flicker beyond normal chapter load.

### Puzzle 01 (COUNT)
- [ ] `COUNT(*)` returns 3000.
- [ ] Picking `SUM(*)` or `AVG(*)` errors → hint.

### Puzzle 02 (COUNT DISTINCT)
- [ ] `COUNT(DISTINCT occupation)` returns 25 (or however many the generator produced).

### Puzzle 03 (SUM)
- [ ] `SUM(annual_wage_cents)` returns ~2 × 10^8. Big number.

### Puzzle 04 (MIN/MAX/AVG)
- [ ] Three-aggregate SELECT returns one row with MIN, MAX, AVG of age.
- [ ] Ordering mistakes (MIN instead of MAX) trigger different-values hints.

### Puzzle 05 (GROUP BY borough — anomaly)
- [ ] Returns 6 rows: 5 boroughs + NULL.
- [ ] Manhattan leads by a wide margin.
- [ ] The NULL bucket has count = 1. Success text calls it out.

### Puzzle 06 (Composite GROUP BY)
- [ ] Returns 6 rows with borough, count, avg(age), max(age).
- [ ] NULL row: borough=NULL, count=1, avg_age=43, max_age=43.
- [ ] Outro: Grayson names Hemiunu; Carol connects all three timelines.

## Reference drawer — Chapter 4
- [ ] Drawer shows 13 concepts.
- [ ] COUNT / SUM / AVG / MIN / MAX / GROUP BY all render without error.

## Chapter 5 — Oldrich's Repeat Customers (typing mode)

### Boot & navigation
- [ ] Solving Chapter 4 Puzzle 06 auto-advances to Chapter 5; OR set localStorage state to land directly.
- [ ] Carol's boss intro renders, mentioning the parchment-and-candle bookkeeping detail and the plague hurry.
- [ ] Progress indicator shows Chapter 5.

### Mechanic — typing
- [ ] All Chapter 5 puzzles render text inputs (not dropdowns, not word-bank chips).
- [ ] Inputs accept free-form text including parentheses, asterisks, and quotes.
- [ ] Run button is disabled until every blank has at least one character.
- [ ] After a successful run, inputs become read-only / non-editable.

### Per-puzzle correctness
- [ ] **Puzzle 01:** Type `visit_id, patron_id, visit_date, tab_groschen` and `visits`. Submit. Oldrich's success copy appears.
- [ ] **Puzzle 01 wrong path:** Type `oldrich` for the table name. Error hint fires (not a generic hint).
- [ ] **Puzzle 02:** Type `COUNT(DISTINCT patron_id)`. Success.
- [ ] **Puzzle 02 wrong path:** Type `COUNT(*)` instead. Wrong-count-high hint fires.
- [ ] **Puzzle 03:** Type `COUNT(*)` and `patron_id`. Success. Pavel (id 1) at the top of the result, 69 visits.
- [ ] **Puzzle 04:** Type `COUNT(*) >= 20`. Success. Result has 7 rows. Oldrich's success copy mentions the seventh stranger.
- [ ] **Puzzle 04 wrong path:** Type `COUNT(*) > 20` (strict). Wrong-count-low hint fires.
- [ ] **Puzzle 05:** Type `EXTRACT(MONTH FROM visit_date)` for both blanks. Success. Result has 7 rows (months 1-7) for Mireska.
- [ ] **Puzzle 06:** Type `COUNT(DISTINCT DATE_TRUNC('week', visit_date)) >= 50`. Success. Result is exactly one row, patron_id = 30. Oldrich's success copy reveals "Hemiunu" and "paid in old coin."
- [ ] **Puzzle 06 wrong path:** Type `>= 30` instead. Wrong-count-high hint fires.

### Outro / Chapter 6 stinger
- [ ] After solving Puzzle 06, the outro fires.
- [ ] Carol's outro names Old Kingdom Egypt, 1920s Chicago, 1890 New York, and 1347 Prague together.
- [ ] The line "Hope you've been thinking about how to read more than one table at a time" renders.

### Browser compat
- [ ] All of the above passes in Chrome.
- [ ] All of the above passes in Safari.

### Visual
- [ ] Typed inputs sit cleanly inside the query line; no overflow or wrap mid-keyword.
- [ ] Focused input has a visible focus ring.
- [ ] Placeholder text is visible and italicized when input is empty.

## Reference drawer — Chapter 5
- [ ] Drawer shows 11 concepts (the carry-forward set minus LIKE/IS NULL/string-functions, plus DISTINCT, HAVING, Date functions).
- [ ] DISTINCT, HAVING, Date functions all load and render markdown without error.

## Chapter 6 — The Reunion (typing mode, season finale)

### Boot & navigation
- [ ] Solving Chapter 5 Puzzle 06 auto-advances to Chapter 6; OR set localStorage state to land directly.
- [ ] Carol's boss intro renders, mentioning the five ledgers on the desk and the firm being "around longer than the firm."
- [ ] Progress indicator shows Chapter 6.

### Mechanic — typing (regression)
- [ ] All Chapter 6 puzzles render text inputs (not dropdowns, not word-bank chips).
- [ ] Run button is disabled until every blank has at least one character.

### Per-puzzle correctness
- [ ] **Puzzle 01:** Type `engagement_id, client_id, era, year, anomaly_note` and `chrono_engagements`. Submit. Carol's success copy appears.
- [ ] **Puzzle 02:** Type `chrono_clients` and `chrono_engagements.client_id = chrono_clients.client_id`. Submit. Result has 10 rows with names attached.
- [ ] **Puzzle 03:** Type `e.era, e.year, c.name` and `e.client_id = c.client_id`. Submit. Result is 10 rows, same shape as puzzle 02 but using aliases.
- [ ] **Puzzle 04:** Type `e.anomaly_note IS NOT NULL`. Submit. Result is exactly 9 rows. Carol's success copy mentions the same name appearing five times.
- [ ] **Puzzle 04 wrong path:** Type `e.anomaly_note != NULL`. Error hint about IS NOT NULL fires.
- [ ] **Puzzle 05:** Type `era_records r` and `r.engagement_id = e.engagement_id`. Submit. Result is 9 rows with detail and location columns.
- [ ] **Puzzle 06:** Type `c.name = 'Hemiunu'` and `e.year`. Submit. Result is exactly 5 rows in chronological order; last row is `Chrono HQ` / `2026`. Carol's "in our basement the entire time" line lands.
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

## Security spot-check
- [ ] Devtools: `fetch('/run', { method: 'POST', body: JSON.stringify({ chapter: '01-onboarding', sql: 'DROP TABLE clients' }), headers: { 'Content-Type': 'application/json' }}).then(r=>r.json()).then(console.log)` → `{ error: 'Only SELECT queries are allowed' }`.
- [ ] Same with `SELECT * FROM read_csv('/etc/hostname')` → error about filesystem access.

## Responsive
- [ ] Resize to ~400px wide. Main layout still usable (dialogue and puzzle readable; reference drawer fills viewport).

## Tone
- [ ] Carol's voice feels consistent across bubbles.
- [ ] Hints feel in-character, not like error dumps.
- [ ] No bubbles feel preachy or condescending.

## Chapter 7 — Static

### Boot and navigation
- [ ] Carol's boss-intro bubble mentions the redacted email and "M."
- [ ] Progress indicator shows "Static · Puzzle 1 of 6".
- [ ] Reference drawer shows DDSQL tags tab alongside SELECT, FROM, WHERE, LIMIT, Comparison ops.
- [ ] DDSQL tags reference renders correctly (forms, notes).

### Puzzle 01 — Schema intro (no DDSQL yet)
- [ ] Two typed inputs visible (columns, table name).
- [ ] Correct answer: `timestamp, message, tags` / `logs` → 10 rows, success bubble.
- [ ] Wrong column name (e.g. `ts`) → error hint.
- [ ] Wrong table name (e.g. `log`) → error hint.

### Puzzle 02 — Single tag filter
- [ ] Brief mentions `service:auth-svc`.
- [ ] Typing `service:auth-svc` → ~150 rows, success bubble.
- [ ] Typing `service:api-gateway` → different row count, no success.
- [ ] Typing `auth-svc` (no key:) → error hint (invalid SQL).

### Puzzle 03 — Implicit AND
- [ ] Brief mentions space-separated implicit AND.
- [ ] Typing `service:auth-svc env:prod` → ~110 rows, success.
- [ ] Typing just `service:auth-svc` → ~150 rows, wrong count hint.

### Puzzle 04 — Negation
- [ ] Brief mentions `-level:info` with the leading hyphen.
- [ ] Typing `service:auth-svc env:prod -level:info` → 30 rows, success.
- [ ] Typing `service:auth-svc env:prod level:info` (no hyphen) → wrong count.

### Puzzle 05 — All errors (phantom surface)
- [ ] Typing `level:error` → 48 rows, success.
- [ ] Success copy mentions `chrono-portal-mirror` and "Forty-eight errors."
- [ ] Brief for puzzle 06 appears immediately after success.

### Puzzle 06 — Phantom finale
- [ ] Typing `service:chrono-portal-mirror` → 6 rows, success.
- [ ] Success copy reads six cryptic messages.
- [ ] Chapter outro plays: voicemail from "M.", "Find me the seconds."
- [ ] Outro auto-advances to Chapter 8.

## Chapter 8 — When (time windows + bucket)

### Boot and navigation
- [ ] Solving Chapter 7 Puzzle 06 auto-advances to Chapter 8; OR set localStorage state to land directly.
- [ ] Carol's boss-intro bubble references "I know that time" and "chrono-portal-mirror has a schedule."
- [ ] Progress indicator shows "When · Puzzle 1 of 6".
- [ ] Reference drawer shows Time windows tab alongside SELECT, FROM, WHERE, GROUP BY, ORDER BY, COUNT, DDSQL tags.
- [ ] Time windows reference renders correctly (forms, offset table, bucket table).

### Puzzle 01 — Time range
- [ ] One typed input visible (table name).
- [ ] Correct answer: `logs` → 1 row showing 08:00:00 start and 11:00:00 end. Success bubble.
- [ ] Wrong table name (e.g. `log`) → error hint.

### Puzzle 02 — Last hour filter
- [ ] Brief mentions `@timestamp:[now-1h to now]` explicitly.
- [ ] Typing `@timestamp:[now-1h to now]` → ~1000 rows limited to 20 shown. Success bubble.
- [ ] Typing `level:error` → error hint (no @timestamp in WHERE).

### Puzzle 03 — Bucket by minute
- [ ] Brief mentions `bucket(timestamp, 1m)`.
- [ ] Typing `bucket(timestamp, 1m)` → ~60 rows (one per minute), order_sensitive. Success bubble.
- [ ] Typing `bucket(timestamp, 1h)` → 1 row (wrong count) → wrong-count-low hint.
- [ ] Carol's success text: "Fifty-seven minutes in. Something happened there."

### Puzzle 04 — Spike window
- [ ] Brief says "last five minutes."
- [ ] Typing `@timestamp:[now-5m to now]` → ~212 rows. Success bubble.
- [ ] Carol's success text mentions "chrono-portal-mirror" and "four logs."

### Puzzle 05 — Errors by second
- [ ] Brief mentions "bucket by second" and "errors only."
- [ ] Typing `bucket(timestamp, 1s)` → 4 rows (one per spike second). Success bubble.
- [ ] Typing `bucket(timestamp, 1m)` → fewer than 4 rows or wrong shape → wrong-count hint.
- [ ] Carol's success text: "Four seconds."

### Puzzle 06 — Phantom timestamps
- [ ] Brief says "all four."
- [ ] Typing `service:chrono-portal-mirror` → 4 rows ordered by timestamp. Success bubble.
- [ ] Carol's success text: "Those seconds. She already knew which ones."
- [ ] Chapter outro plays: Carol's Post-it note, "I want to know how fast it moves."
- [ ] Outro auto-advances to Chapter 9.

### Reference drawer — Chapter 8
- [ ] Drawer shows 8 concepts: SELECT, FROM, WHERE, GROUP BY, ORDER BY, COUNT, DDSQL tags, Time windows.
- [ ] Time windows renders with @timestamp and bucket() sections.
- [ ] Switching between concepts works; aria-current updates.

## Chapter 9 — Heat (rate function)

### Boot & navigation
- [ ] Solving Chapter 8 Puzzle 06 auto-advances to Chapter 9; OR set localStorage state to land directly.
- [ ] Carol's boss intro renders, mentioning pre-aggregated metrics and the rate function.
- [ ] Progress indicator shows Chapter 9.

### Mechanic — typing (regression)
- [ ] All Chapter 9 puzzles render text inputs (not dropdowns, not word-bank chips).
- [ ] Run button is disabled until every blank has at least one character.

### Per-puzzle correctness
- [ ] **Puzzle 01:** Type `metrics`. Submit. Ten rows returned with columns minute, service, n, errors. Success bubble appears.
- [ ] **Puzzle 01 wrong path:** Type `logs`. Error hint fires.
- [ ] **Puzzle 02:** Type `n`. Submit. 20 rows ordered by rps DESC. chrono-portal-mirror spike minutes appear near the top. Success bubble.
- [ ] **Puzzle 02 wrong path:** Type `errors`. Different values hint fires.
- [ ] **Puzzle 03:** Type `service`. Submit. 6 rows, chrono-portal-mirror first with peak_rps ≈ 3.x. Success bubble.
- [ ] **Puzzle 04:** Type `errors`. Submit. 120 rows for chrono-portal-mirror, ordered by minute. Both rps and err_rps columns visible. Success bubble.
- [ ] **Puzzle 05:** Type `1.0`. Submit. Exactly 6 rows. Success bubble mentions schedule.
- [ ] **Puzzle 05 wrong path:** Type `3.5`. Zero rows. wrong_count_low hint fires.
- [ ] **Puzzle 06:** Type `errors`. Submit. 6 rows with both rps and err_rps. Success bubble says "every single one."
- [ ] **Puzzle 06 wrong path:** Type `n`. Different values hint fires (same rows, wrong second column).

### Outro
- [ ] After solving Puzzle 06, outro fires.
- [ ] Carol's outro mentions "eighteen minutes" and "schedule."
- [ ] Outro does NOT auto-advance (Chapter 10 not yet shipped).

### Reference drawer — Chapter 9
- [ ] Drawer shows 9 concepts: SELECT, FROM, WHERE, GROUP BY, ORDER BY, DDSQL tags, Time windows, COUNT, rate().
- [ ] rate() entry renders markdown without error, shows the DDSQL → equivalent table.
- [ ] Switching between concepts works; aria-current updates.
