import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSql } from '../server/security.js';

test('SELECT is allowed', () => {
  assert.equal(validateSql('SELECT 1').ok, true);
});

test('SELECT with whitespace and lowercase is allowed', () => {
  assert.equal(validateSql('   select * from t').ok, true);
});

test('WITH ... SELECT is allowed (CTE)', () => {
  assert.equal(validateSql('WITH x AS (SELECT 1) SELECT * FROM x').ok, true);
});

test('SELECT with trailing semicolon is allowed', () => {
  assert.equal(validateSql('SELECT 1;').ok, true);
});

test('DROP is rejected', () => {
  const r = validateSql('DROP TABLE t');
  assert.equal(r.ok, false);
  assert.match(r.error, /only select/i);
});

test('INSERT is rejected', () => {
  assert.equal(validateSql('INSERT INTO t VALUES (1)').ok, false);
});

test('UPDATE is rejected', () => {
  assert.equal(validateSql('UPDATE t SET x = 1').ok, false);
});

test('DELETE is rejected', () => {
  assert.equal(validateSql('DELETE FROM t').ok, false);
});

test('CREATE is rejected', () => {
  assert.equal(validateSql('CREATE TABLE t (x INT)').ok, false);
});

test('ALTER is rejected', () => {
  assert.equal(validateSql('ALTER TABLE t ADD COLUMN y INT').ok, false);
});

test('COPY is rejected', () => {
  assert.equal(validateSql("COPY t TO '/tmp/x.csv'").ok, false);
});

test('LOAD is rejected', () => {
  assert.equal(validateSql('LOAD httpfs').ok, false);
});

test('INSTALL is rejected', () => {
  assert.equal(validateSql('INSTALL httpfs').ok, false);
});

test('ATTACH is rejected', () => {
  assert.equal(validateSql("ATTACH 'x.db'").ok, false);
});

test('PRAGMA is rejected', () => {
  assert.equal(validateSql('PRAGMA version').ok, false);
});

test('stacked SELECT; DROP is rejected', () => {
  const r = validateSql('SELECT 1; DROP TABLE t');
  assert.equal(r.ok, false);
  assert.match(r.error, /multiple statements|one statement/i);
});

test('empty string is rejected', () => {
  assert.equal(validateSql('').ok, false);
});

test('only comments is rejected', () => {
  assert.equal(validateSql('-- hello').ok, false);
});

test('SELECT with inline comment is allowed', () => {
  assert.equal(validateSql('SELECT 1 -- row count\nFROM (SELECT 1)').ok, true);
});

test('SELECT with block comment is allowed', () => {
  assert.equal(validateSql('/* tag */ SELECT 1').ok, true);
});
