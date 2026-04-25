import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, markSolved, setCurrent, recordAttempt, isSolved,
} from '../src/state.js';

test('emptyState has required shape', () => {
  const s = emptyState();
  assert.equal(s.currentChapterId, null);
  assert.equal(s.currentPuzzleId, null);
  assert.deepEqual(s.chapters, {});
});

test('setCurrent updates pointer and creates chapter entry', () => {
  const s = emptyState();
  const s2 = setCurrent(s, '01-onboarding', '01');
  assert.equal(s2.currentChapterId, '01-onboarding');
  assert.equal(s2.currentPuzzleId, '01');
  assert.deepEqual(s2.chapters['01-onboarding'].solved, []);
});

test('recordAttempt increments attempt count', () => {
  let s = setCurrent(emptyState(), '01-onboarding', '01');
  s = recordAttempt(s, '01-onboarding', '01');
  s = recordAttempt(s, '01-onboarding', '01');
  assert.equal(s.chapters['01-onboarding'].attempts['01'], 2);
});

test('markSolved adds to solved list and marks chapter completed at end', () => {
  let s = setCurrent(emptyState(), '01-onboarding', '01');
  s = markSolved(s, '01-onboarding', '01', ['01', '02', '03', '04', '05']);
  assert.ok(isSolved(s, '01-onboarding', '01'));
  assert.equal(s.chapters['01-onboarding'].completed, false);

  s = markSolved(s, '01-onboarding', '02', ['01', '02', '03', '04', '05']);
  s = markSolved(s, '01-onboarding', '03', ['01', '02', '03', '04', '05']);
  s = markSolved(s, '01-onboarding', '04', ['01', '02', '03', '04', '05']);
  s = markSolved(s, '01-onboarding', '05', ['01', '02', '03', '04', '05']);
  assert.equal(s.chapters['01-onboarding'].completed, true);
});

test('markSolved is idempotent (no duplicate in solved list)', () => {
  let s = setCurrent(emptyState(), '01-onboarding', '01');
  s = markSolved(s, '01-onboarding', '01', ['01']);
  s = markSolved(s, '01-onboarding', '01', ['01']);
  assert.equal(s.chapters['01-onboarding'].solved.length, 1);
});
