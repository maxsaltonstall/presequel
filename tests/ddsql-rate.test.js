import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateRate, translateTagFilter } from '../server/ddsql.js';

test('rate(n, 1m) → ROUND(n / 60.0, 2)', () => {
  assert.equal(
    translateRate('SELECT rate(n, 1m) AS rps FROM metrics'),
    'SELECT ROUND(n / 60.0, 2) AS rps FROM metrics'
  );
});

test('rate(errors, 1m) → ROUND(errors / 60.0, 2)', () => {
  assert.equal(
    translateRate('SELECT rate(errors, 1m) AS err_rps FROM metrics'),
    'SELECT ROUND(errors / 60.0, 2) AS err_rps FROM metrics'
  );
});

test('case-insensitive: RATE(n, 1M) → ROUND(n / 60.0, 2)', () => {
  assert.equal(
    translateRate('SELECT RATE(n, 1M) AS rps FROM metrics'),
    'SELECT ROUND(n / 60.0, 2) AS rps FROM metrics'
  );
});

test('inside SELECT with alias: rate replaced correctly', () => {
  assert.equal(
    translateRate('SELECT service, rate(n, 1m) AS rps FROM metrics'),
    'SELECT service, ROUND(n / 60.0, 2) AS rps FROM metrics'
  );
});

test('inside WHERE: rate(n, 1m) > 1.0 → ROUND(n / 60.0, 2) > 1.0', () => {
  assert.equal(
    translateRate("SELECT minute FROM metrics WHERE service = 'x' AND rate(n, 1m) > 1.0"),
    "SELECT minute FROM metrics WHERE service = 'x' AND ROUND(n / 60.0, 2) > 1.0"
  );
});

test('inside aggregate: MAX(rate(n, 1m)) → MAX(ROUND(n / 60.0, 2))', () => {
  assert.equal(
    translateRate('SELECT service, MAX(rate(n, 1m)) AS peak FROM metrics GROUP BY service'),
    'SELECT service, MAX(ROUND(n / 60.0, 2)) AS peak FROM metrics GROUP BY service'
  );
});

test('no match: rate(n, 5m) → unchanged', () => {
  const sql = 'SELECT rate(n, 5m) FROM metrics';
  assert.equal(translateRate(sql), sql);
});

test('no match: rate(n) (no interval) → unchanged', () => {
  const sql = 'SELECT rate(n) FROM metrics';
  assert.equal(translateRate(sql), sql);
});

test('composition: translateRate output survives translateTagFilter unchanged', () => {
  const sql = "SELECT rate(n, 1m) AS rps FROM metrics WHERE service:auth-svc";
  assert.equal(
    translateTagFilter(translateRate(sql)),
    "SELECT ROUND(n / 60.0, 2) AS rps FROM metrics WHERE tags['service'] = 'auth-svc'"
  );
});

test('multiple rate() calls in one query: both replaced', () => {
  assert.equal(
    translateRate('SELECT rate(n, 1m) AS rps, rate(errors, 1m) AS err_rps FROM metrics'),
    'SELECT ROUND(n / 60.0, 2) AS rps, ROUND(errors / 60.0, 2) AS err_rps FROM metrics'
  );
});
