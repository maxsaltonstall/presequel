import { DuckDBInstance } from '@duckdb/node-api';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_ROOT } from './content-root.js';

const __projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const connections = new Map();

function chapterSeedPath(chapterId) {
  if (!/^[a-z0-9-]+$/.test(chapterId)) {
    throw new Error(`invalid chapter id format: ${chapterId}`);
  }
  return resolve(__projectRoot, 'content', 'chapters', chapterId, 'seed.sql');
}

async function openChapter(chapterId) {
  const seedPath = chapterSeedPath(chapterId);
  const seedSql = await readFile(seedPath, 'utf8').catch((err) => {
    throw new Error(`Could not load seed.sql for chapter "${chapterId}": ${err.message}`);
  });
  const expandedSeed = seedSql.replaceAll('${CONTENT_ROOT}', CONTENT_ROOT);
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  const extracted = await connection.extractStatements(expandedSeed);
  for (let i = 0; i < extracted.count; i++) {
    const prepared = await extracted.prepare(i);
    try {
      await prepared.run();
    } finally {
      prepared.destroySync();
    }
  }
  await connection.run('SET enable_external_access = false');
  await connection.run('SET lock_configuration = true');
  return { instance, connection };
}

function normalizeValue(v) {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 23);
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (v !== null && typeof v === 'object') {
    if (v.toString !== Object.prototype.toString) return v.toString();
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = normalizeValue(val);
    return out;
  }
  return v;
}

export const QUERY_TIMEOUT_MS = 5000;
export const ROW_LIMIT = 10000;

export async function runQuery(chapterId, sql) {
  if (!connections.has(chapterId)) {
    connections.set(chapterId, await openChapter(chapterId));
  }
  const { connection } = connections.get(chapterId);

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { connection.interrupt?.(); } catch {}
      reject(new Error('Query took too long — try simplifying'));
    }, QUERY_TIMEOUT_MS);
  });

  try {
    const reader = await Promise.race([connection.runAndReadAll(sql), timeout]);
    clearTimeout(timer);
    const columns = reader.columnNames();
    const rowsAll = reader.getRows().map((row) => row.map(normalizeValue));
    const truncated = rowsAll.length > ROW_LIMIT;
    const rows = truncated ? rowsAll.slice(0, ROW_LIMIT) : rowsAll;
    return truncated
      ? { columns, rows, truncated: true }
      : { columns, rows };
  } catch (err) {
    clearTimeout(timer);
    if (/took too long/i.test(err.message)) resetChapter(chapterId);
    throw err;
  }
}

export function resetChapter(chapterId) {
  const entry = connections.get(chapterId);
  if (entry) {
    entry.connection.closeSync?.();
    entry.instance.closeSync?.();
    connections.delete(chapterId);
  }
}
