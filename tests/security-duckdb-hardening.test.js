import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter } from '../server/duckdb.js';

test('read_csv fails at DuckDB level (hardened config)', async () => {
  resetChapter('01-onboarding');
  // Note: runQuery does not go through validateSql, so this tests the
  // DuckDB-level defense.
  await assert.rejects(
    () => runQuery('01-onboarding', "SELECT * FROM read_csv('/etc/hostname')"),
    /disabled|not allowed|filesystem|enabled_file_access/i
  );
});

test('SELECT against pre-seeded table still works after hardening', async () => {
  const r = await runQuery('01-onboarding', 'SELECT COUNT(*) AS c FROM clients');
  assert.equal(r.rows[0][0], 20);
});
