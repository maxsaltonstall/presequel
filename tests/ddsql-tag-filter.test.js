import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateTagFilter } from '../server/ddsql.js';

test('single tag: key:value → tags[key] = value', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-svc"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc'"
  );
});

test('multi-tag: space-separated tokens → implicit AND', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-svc env:prod"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND tags['env'] = 'prod'"
  );
});

test('negation: -key:value → tags[key] != value', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE -level:info"),
    "SELECT * FROM logs WHERE tags['level'] != 'info'"
  );
});

test('mixed positive and negation', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-svc env:prod -level:info"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND tags['env'] = 'prod' AND tags['level'] != 'info'"
  );
});

test('pass-through: no WHERE clause returns input unchanged', () => {
  const sql = "SELECT timestamp, message, tags FROM logs LIMIT 10";
  assert.equal(translateTagFilter(sql), sql);
});

test('pass-through: already-translated DuckDB form returns input unchanged', () => {
  const sql = "SELECT * FROM logs WHERE tags['service'] = 'auth-svc'";
  assert.equal(translateTagFilter(sql), sql);
});

test('quoted value with spaces', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:'my service'"),
    "SELECT * FROM logs WHERE tags['service'] = 'my service'"
  );
});

test('wildcard value is preserved as literal (returns no rows, not an error)', () => {
  assert.equal(
    translateTagFilter("SELECT * FROM logs WHERE service:auth-*"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-*'"
  );
});
