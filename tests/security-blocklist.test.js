import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSql } from '../server/security.js';

const BLOCKED = [
  "SELECT * FROM read_csv('/etc/passwd')",
  "SELECT * FROM read_csv_auto('/etc/passwd')",
  "SELECT * FROM read_parquet('/tmp/x.parquet')",
  "SELECT * FROM read_json('/tmp/x.json')",
  "SELECT * FROM read_json_auto('/tmp/x.json')",
  "SELECT * FROM read_json_objects('/tmp/x.json')",
  "SELECT read_blob('/tmp/x')",
  "SELECT read_text('/tmp/x')",
  "SELECT * FROM glob('/etc/*')",
  "SELECT * FROM parquet_metadata('/tmp/x.parquet')",
  "SELECT * FROM parquet_file_metadata('/tmp/x.parquet')",
  "SELECT * FROM parquet_schema('/tmp/x.parquet')",
  "SELECT * FROM parquet_kv_metadata('/tmp/x.parquet')",
  "SELECT * FROM sniff_csv('/tmp/x.csv')",
];

for (const sql of BLOCKED) {
  test(`rejects blocked function: ${sql.slice(0, 50)}`, () => {
    const r = validateSql(sql);
    assert.equal(r.ok, false, `expected rejection for: ${sql}`);
    assert.match(r.error, /not allowed|blocked|filesystem/i);
  });
}

test('uppercase function name is also blocked', () => {
  assert.equal(validateSql("SELECT * FROM READ_CSV('x')").ok, false);
});

test('function-like name that is not blocked (e.g. read_custom) is allowed', () => {
  // Column named something similar is fine; it's only a call when followed by (
  assert.equal(validateSql("SELECT read_custom FROM t").ok, true);
});

test('allow-list still permits legit SELECT', () => {
  assert.equal(validateSql('SELECT name FROM clients').ok, true);
});
