#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';

const __root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CONTENT_ROOT = resolve(__root, 'content');
const chaptersDir = resolve(__root, 'content', 'chapters');

const errors = [];

function fail(path, msg) { errors.push(`${path}: ${msg}`); }

function validateChapterJson(path, c) {
  for (const key of ['id', 'ordinal', 'title', 'era', 'client', 'puzzle_ids', 'mechanic_mode']) {
    if (!(key in c)) fail(path, `missing key "${key}"`);
  }
  if (!Array.isArray(c.puzzle_ids)) fail(path, 'puzzle_ids must be array');
  if (!['dropdown', 'word_bank', 'typing'].includes(c.mechanic_mode)) {
    fail(path, `mechanic_mode must be one of dropdown|word_bank|typing (got ${c.mechanic_mode})`);
  }
}

function validatePuzzleJson(path, p) {
  for (const key of ['id', 'concept', 'brief', 'template', 'expected', 'hints', 'success']) {
    if (!(key in p)) fail(path, `missing key "${key}"`);
  }
  if (!p.expected || typeof p.expected.sql !== 'string') fail(path, 'expected.sql required');
  if (!Array.isArray(p.template)) fail(path, 'template must be array');
  for (const tok of p.template || []) {
    if (!['keyword', 'text', 'blank'].includes(tok.type)) fail(path, `unknown token type: ${tok.type}`);
    if (tok.type === 'blank') {
      if (!tok.id || !tok.mode) {
        fail(path, `blank requires id and mode (in ${JSON.stringify(tok)})`);
      } else if (tok.mode !== 'typed' && !Array.isArray(tok.options)) {
        fail(path, `blank with mode "${tok.mode}" requires options (in ${JSON.stringify(tok)})`);
      }
    }
  }
}

async function runExpectedAgainstSeed(chapterId, seedSql, puzzle) {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  const expandedSeed = seedSql.replaceAll('${CONTENT_ROOT}', CONTENT_ROOT);
  const extracted = await conn.extractStatements(expandedSeed);
  for (let i = 0; i < extracted.count; i++) {
    const prepared = await extracted.prepare(i);
    try {
      await prepared.run();
    } finally {
      prepared.destroySync();
    }
  }
  try {
    const reader = await conn.runAndReadAll(puzzle.expected.sql);
    reader.getRows();
  } catch (err) {
    fail(`${chapterId}/puzzles/${puzzle.id}.json`,
      `expected.sql failed: ${err.message}`);
  }
}

async function main() {
  const chapterDirs = (await readdir(chaptersDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);

  for (const chapterId of chapterDirs) {
    const chRoot = resolve(chaptersDir, chapterId);
    const chPath = resolve(chRoot, 'chapter.json');
    let chapter;
    try { chapter = JSON.parse(await readFile(chPath, 'utf8')); }
    catch (err) { fail(chPath, `unreadable: ${err.message}`); continue; }
    validateChapterJson(chPath, chapter);

    const seedSql = await readFile(resolve(chRoot, 'seed.sql'), 'utf8').catch(() => null);
    if (!seedSql) { fail(chRoot, 'missing seed.sql'); continue; }

    const puzzlesDir = resolve(chRoot, 'puzzles');
    const puzzleFiles = (await readdir(puzzlesDir).catch(() => []))
      .filter((f) => f.endsWith('.json'));
    for (const f of puzzleFiles) {
      const path = resolve(puzzlesDir, f);
      let puzzle;
      try { puzzle = JSON.parse(await readFile(path, 'utf8')); }
      catch (err) { fail(path, `unreadable: ${err.message}`); continue; }
      validatePuzzleJson(path, puzzle);
      if (puzzle.expected?.sql) {
        await runExpectedAgainstSeed(chapterId, seedSql, puzzle);
      }
    }
  }

  if (errors.length === 0) {
    console.log('Content valid: all chapters and puzzles pass.');
  } else {
    console.error(`Content validation failed (${errors.length}):`);
    for (const e of errors) console.error('  ' + e);
    process.exitCode = 1;
  }
}

main();
