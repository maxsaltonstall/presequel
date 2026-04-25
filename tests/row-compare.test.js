import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRows } from '../src/puzzle.js';

test('identical rows match (unordered)', () => {
  const a = [[1, 'x'], [2, 'y']];
  const b = [[2, 'y'], [1, 'x']];
  assert.equal(compareRows(a, b, false).status, 'match');
});

test('order-sensitive mismatch', () => {
  const a = [[1, 'x'], [2, 'y']];
  const b = [[2, 'y'], [1, 'x']];
  const r = compareRows(a, b, true);
  assert.equal(r.status, 'different-values');
});

test('too few rows', () => {
  const r = compareRows([[1]], [[1], [2]], false);
  assert.equal(r.status, 'wrong-count-low');
});

test('too many rows', () => {
  const r = compareRows([[1], [2], [3]], [[1], [2]], false);
  assert.equal(r.status, 'wrong-count-high');
});

test('same count different values', () => {
  const r = compareRows([[1], [3]], [[1], [2]], false);
  assert.equal(r.status, 'different-values');
});

test('different column count counts as different-values', () => {
  const r = compareRows([[1, 'x']], [[1]], false);
  assert.equal(r.status, 'different-values');
});
