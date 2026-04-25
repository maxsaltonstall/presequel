#!/usr/bin/env node
// Generate a deterministic synthetic 1890 NYC census CSV.
// Seeded PRNG so the output is identical on every run.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = resolve(__root, 'content', 'chapters', '04-census', 'census_1890.csv');
const TOTAL_ROWS = 3000;

let rngState = 1729;
function rand() {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function pickWeighted(arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
function intBetween(lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }

const SURNAMES = [
  "O'Brien","Murphy","Sullivan","Kelly","Ryan","Walsh","McCarthy","Callahan",
  "Schmidt","Mueller","Becker","Fischer","Weber","Hoffmann","Klein","Wagner",
  "Rossi","Ferrari","Russo","Esposito","Bianchi","Ricci","Conti","Marino",
  "Cohen","Levy","Goldberg","Katz","Friedman","Stein","Roth","Silverman",
  "Smith","Johnson","Williams","Brown","Jones","Miller","Davis","Wilson",
  "Kowalski","Novak","Wojcik","Lewandowski",
  "Andersen","Johansson","Petrov","Ivanov",
];
const FIRST_NAMES_M = [
  "John","James","Michael","William","Patrick","Thomas","Daniel","Joseph",
  "Heinrich","Friedrich","Karl","Otto","Wilhelm",
  "Giovanni","Giuseppe","Antonio","Luigi","Salvatore",
  "Isaac","Abraham","Samuel","David","Jacob",
  "Stanislaw","Josef","Boris",
];
const FIRST_NAMES_F = [
  "Mary","Bridget","Catherine","Margaret","Ellen","Sarah","Anna","Elizabeth",
  "Gertrud","Hilda","Marta","Greta",
  "Maria","Rosa","Angela","Teresa",
  "Rachel","Rebecca","Esther","Ruth","Leah",
  "Olga","Zofia",
];
const OCCUPATIONS = [
  "laborer","servant","seamstress","carpenter","clerk","teacher","factory worker",
  "merchant","bookkeeper","tailor","cobbler","baker","butcher","grocer",
  "engineer","machinist","porter","washerwoman","typesetter","driver",
  "nurse","shopkeeper","milliner","stevedore","none",
];
const BOROUGHS = ["Manhattan","Brooklyn","Bronx","Queens","Staten Island"];
const BOROUGH_WEIGHTS = [58, 30, 5, 5, 2];
const BIRTHPLACES = [
  "New York","Ireland","Germany","Italy","Russia","England","Poland","Scotland",
  "Austria-Hungary","Sweden","Norway","France","New Jersey","Massachusetts","Pennsylvania",
];
const BIRTHPLACE_WEIGHTS = [34, 22, 18, 10, 6, 3, 3, 1, 1, 1, 1, 1, 3, 2, 1];
const MARITAL = ["single","married","widowed","divorced"];
const MARITAL_WEIGHTS = [45, 45, 9, 1];

const rows = [];
let householdSeq = 1;
let i = 1;

while (i <= TOTAL_ROWS - 1) {
  const surname = pick(SURNAMES);
  const size = intBetween(1, 5);
  const borough = pickWeighted(BOROUGHS, BOROUGH_WEIGHTS);
  const birthplace = pickWeighted(BIRTHPLACES, BIRTHPLACE_WEIGHTS);
  const household_id = householdSeq++;

  for (let k = 0; k < size && i <= TOTAL_ROWS - 1; k++) {
    const sex = rand() < 0.5 ? "M" : "F";
    const fn = pick(sex === "M" ? FIRST_NAMES_M : FIRST_NAMES_F);
    const age = Math.min(95, Math.max(0, Math.floor(Math.pow(rand(), 1.5) * 80)));
    const marital = age < 16 ? "single" : pickWeighted(MARITAL, MARITAL_WEIGHTS);
    const occ = (age < 12 || (age < 16 && rand() < 0.5)) ? "none" : pick(OCCUPATIONS);
    const baseWage = {
      "engineer": 90000, "teacher": 55000, "bookkeeper": 60000, "clerk": 45000,
      "merchant": 120000, "shopkeeper": 70000, "nurse": 40000, "tailor": 38000,
      "typesetter": 42000, "machinist": 48000, "carpenter": 45000, "baker": 35000,
      "butcher": 37000, "grocer": 40000, "driver": 32000, "porter": 28000,
      "factory worker": 30000, "milliner": 30000, "seamstress": 24000,
      "washerwoman": 20000, "servant": 18000, "cobbler": 33000, "stevedore": 35000,
      "laborer": 26000, "none": 0,
    }[occ] || 25000;
    const wage = Math.max(0, baseWage + intBetween(-5000, 15000));

    rows.push([i, surname, fn, age, sex, marital, occ, borough, birthplace, household_id, wage]);
    i++;
  }
}

// Row 3000: THE HEMIUNU ANOMALY.
rows.push([3000, "Hemiunu", "H.", 43, "M", "single", null, null, null, null, null]);

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("'")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const HEADER = "id,surname,first_name,age,sex,marital_status,occupation,borough,birthplace,household_id,annual_wage_cents";
const body = rows.map(r => r.map(csvCell).join(",")).join("\n");

await mkdir(resolve(__root, "content", "chapters", "04-census"), { recursive: true });
await writeFile(OUT, HEADER + "\n" + body + "\n", "utf8");
console.log(`Wrote ${rows.length} rows to ${OUT}`);
