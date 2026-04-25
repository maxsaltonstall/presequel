import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter } from '../server/duckdb.js';

test('first run lazily initializes chapter and returns seeded rows', async () => {
  resetChapter('01-onboarding'); // ensure clean state
  const result = await runQuery('01-onboarding', 'SELECT id, name FROM clients ORDER BY id');
  assert.deepEqual(result.columns, ['id', 'name']);
  assert.equal(result.rows.length, 20);
  assert.equal(result.rows[0][1], 'Menkaure');
});

test('second run reuses the connection (still returns rows)', async () => {
  const result = await runQuery('01-onboarding', 'SELECT COUNT(*) AS c FROM clients');
  assert.equal(result.rows[0][0], 20);
});

test('unknown chapter returns an error-shaped result', async () => {
  await assert.rejects(
    () => runQuery('99-nonexistent', 'SELECT 1'),
    /seed.sql/i
  );
});
