import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, resetChapter, QUERY_TIMEOUT_MS } from '../server/duckdb.js';

test('QUERY_TIMEOUT_MS is exposed', () => {
  assert.equal(typeof QUERY_TIMEOUT_MS, 'number');
  assert.ok(QUERY_TIMEOUT_MS > 0);
});

test('long-running query is aborted with timeout error', async () => {
  resetChapter('01-onboarding');
  // range(1e9) x range(1e9) cross join is far too slow to finish
  // under the default timeout. Catch timeout.
  const started = Date.now();
  await assert.rejects(
    () => runQuery('01-onboarding',
      'SELECT COUNT(*) FROM range(1000000000) a CROSS JOIN range(1000000000) b'),
    /timeout|took too long/i
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < QUERY_TIMEOUT_MS + 2000,
    `expected abort near timeout, got ${elapsed}ms`);
});
