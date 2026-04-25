import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectHint } from '../src/puzzle.js';

const HINTS = [
  { when: 'wrong_count_high', text: 'high' },
  { when: 'wrong_count_low',  text: 'low' },
  { when: 'error',             text: 'err' },
  { when: 'default',           text: 'generic' },
];

test('signal wrong-count-high picks matching hint', () => {
  assert.equal(selectHint(HINTS, 'wrong-count-high').text, 'high');
});

test('signal wrong-count-low picks matching hint', () => {
  assert.equal(selectHint(HINTS, 'wrong-count-low').text, 'low');
});

test('signal error picks error hint', () => {
  assert.equal(selectHint(HINTS, 'error').text, 'err');
});

test('signal different-values falls through to default', () => {
  assert.equal(selectHint(HINTS, 'different-values').text, 'generic');
});

test('missing hint array returns a built-in fallback', () => {
  const hint = selectHint([], 'different-values');
  assert.ok(hint && typeof hint.text === 'string');
});
