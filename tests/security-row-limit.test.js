import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter, ROW_LIMIT } from '../server/duckdb.js';

test('ROW_LIMIT is exposed', () => {
  assert.equal(typeof ROW_LIMIT, 'number');
  assert.equal(ROW_LIMIT, 10000);
});

test('small result is not flagged truncated', async () => {
  resetChapter('01-onboarding');
  const r = await runQuery('01-onboarding', 'SELECT * FROM clients');
  assert.equal(r.rows.length, 20);
  assert.equal(r.truncated, undefined);
});

test('huge result is capped and flagged truncated', async () => {
  const r = await runQuery('01-onboarding',
    'SELECT * FROM range(20000)');
  assert.equal(r.rows.length, ROW_LIMIT);
  assert.equal(r.truncated, true);
});
