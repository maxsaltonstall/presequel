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
  [17, "Mireska the Younger",      "weaver",          "Stare Mesto"],
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
  [30, "Hemiunu",                  "traveler",        null],
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

function isoDate(y, m, d) {
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
  const out = [];
  let cur = isoDate(year, 1, 1);
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

const visits = [];
let nextVisitId = 1;
function add(patronId, dateStr, tab) {
  visits.push({ visit_id: nextVisitId++, patron_id: patronId, visit_date: dateStr, tab_groschen: tab });
}

// HEMIUNU (id 30): every Wednesday of 1347, tab=1, exactly 52 visits.
for (const d of eachDateOfWeekday(1347, 3)) add(30, d, 1);

// PAVEL (id 1): heavy regular Mar-Jun. Sun/Tue/Thu/Sat — four nights a week.
// Comes out to ~70 visits, decisively #1 by total count, distinct from Hemiunu's 52.
const pavelDays = [0, 2, 4, 6];
for (const d of datesInRange('1347-03-01', '1347-06-30')) {
  if (pavelDays.includes(dayOfWeek(d))) add(1, d, 4 + (visits.length % 3));
}

// MIRESKA (id 2): first 30 Sundays of 1347.
const sundays1347 = eachDateOfWeekday(1347, 0);
for (const d of sundays1347.slice(0, 30)) add(2, d, 2);

// FATHER ONDŘEJ (id 3): feast-day visits across the year.
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
for (let i = 0; i < tradingFridays.length; i += 2) add(18, tradingFridays[i], 3);
for (let i = 0; i < tradingFridays.length; i += 3) add(19, tradingFridays[i], 3);
for (let i = 0; i < tradingFridays.length; i += 4) add(20, tradingFridays[i], 3);

// REGULARS (ids 4, 5, 6): exactly three, each just over 20 visits.
// Combined with Pavel, Mireska, and Father Ondřej, this yields exactly six
// patrons with >=20 visits — the count Oldrich names in puzzle 04.
const saturdays = eachDateOfWeekday(1347, 6);
const fridayList = eachDateOfWeekday(1347, 5);
const weekendish = [...saturdays, ...sundays1347].sort();

const REGULARS = [
  { id: 4, days: weekendish.slice(0, 22), tab: 3 },
  { id: 5, days: fridayList.slice(0, 21), tab: 2 },
  { id: 6, days: saturdays.slice(0, 20),  tab: 5 },
];
for (const reg of REGULARS) {
  for (const d of reg.days) add(reg.id, d, reg.tab);
}

// CASUALS (everyone else): 1-15 visits, scattered. Hand-tuned to hit ~500 total.
const CASUAL_IDS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29,
                   31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
for (const pid of CASUAL_IDS) {
  const count = 3 + ((pid * 13) % 12);
  for (let i = 0; i < count; i++) {
    const dayOfYear = 10 + Math.floor((i * 350) / count) + (pid % 7);
    const dateStr = addDays('1347-01-01', dayOfYear - 1);
    if (dateStr <= '1347-12-31') add(pid, dateStr, 1 + ((pid + i) % 5));
  }
}

// PLAGUE FLAVOR: thin out non-Hemiunu visits in Oct-Dec.
// Spare Hemiunu (never misses) and Father Ondřej (plague brings believers).
const before = visits.length;
const filtered = visits.filter((v, idx) => {
  if (v.patron_id === 30) return true;
  if (v.patron_id === 3) return true;
  if (v.visit_date < '1347-10-01') return true;
  return idx % 2 === 0;
});
visits.length = 0;
visits.push(...filtered);
for (let i = 0; i < visits.length; i++) visits[i].visit_id = i + 1;

console.log(`Generated ${PATRONS.length} patrons, ${visits.length} visits ` +
            `(plague flavor dropped ${before - visits.length}).`);

// Sanity checks
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
  throw new Error(`Hemiunu must span >=50 weeks, got ${distinctWeeks(hemiunuVisits)}`);
}
let othersOver50 = 0;
for (const [pid, vs] of visitsByPatron.entries()) {
  if (pid === 30) continue;
  if (distinctWeeks(vs) >= 50) othersOver50++;
}
if (othersOver50 > 0) {
  throw new Error(`Only Hemiunu may span >=50 weeks; found ${othersOver50} other patrons`);
}
// Puzzle 04 returns 7 patrons (the 6 named regulars + Hemiunu, who racks up 52
// weekly visits and trips the threshold without Oldrich consciously knowing him).
// That dissonance is intentional — Hemiunu hides in plain sight here.
const regularsCount = [...visitsByPatron.values()].filter(vs => vs.length >= 20).length;
if (regularsCount !== 7) {
  throw new Error(`Puzzle 04 expects exactly 7 patrons with >=20 visits; got ${regularsCount}`);
}

// Emit SQL
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
