import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../server/events.js';

test('puzzle.attempt requires chapter and puzzle', () => {
  assert.deepEqual(
    validateEvent({ type: 'puzzle.attempt', chapter: 'ch3-census', puzzle: 'p4' }),
    { ok: true, type: 'puzzle.attempt', chapter: 'ch3-census', puzzle: 'p4' },
  );
  assert.equal(validateEvent({ type: 'puzzle.attempt', chapter: 'ch3-census' }).ok, false);
  assert.equal(validateEvent({ type: 'puzzle.attempt', puzzle: 'p4' }).ok, false);
});

test('puzzle.solved requires attempts and clamps to [1,999]', () => {
  const ok = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.attempts, 3);

  const clampHigh = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 50000 });
  assert.equal(clampHigh.attempts, 999);

  const clampLow = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 0 });
  assert.equal(clampLow.attempts, 1);

  const missing = validateEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4' });
  assert.equal(missing.ok, false);
});

test('puzzle.failed requires reason from enum', () => {
  for (const r of ['wrong_result', 'sql_error', 'security_rejected', 'timeout']) {
    assert.equal(validateEvent({ type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4', reason: r }).ok, true);
  }
  assert.equal(validateEvent({ type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4', reason: 'nope' }).ok, false);
  assert.equal(validateEvent({ type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4' }).ok, false);
});

test('hint.used requires chapter and puzzle', () => {
  assert.equal(validateEvent({ type: 'hint.used', chapter: 'ch3', puzzle: 'p4' }).ok, true);
  assert.equal(validateEvent({ type: 'hint.used', chapter: 'ch3' }).ok, false);
});

test('chapter.started / chapter.completed require chapter only', () => {
  assert.equal(validateEvent({ type: 'chapter.started', chapter: 'ch3' }).ok, true);
  assert.equal(validateEvent({ type: 'chapter.completed', chapter: 'ch3' }).ok, true);
  assert.equal(validateEvent({ type: 'chapter.started' }).ok, false);
});

test('unknown type rejected with reason', () => {
  const r = validateEvent({ type: 'nope.nope', chapter: 'ch3' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_type');
});

test('invalid chapter regex rejected', () => {
  assert.equal(validateEvent({ type: 'chapter.started', chapter: 'BAD CHAPTER' }).ok, false);
});

test('invalid puzzle regex rejected', () => {
  assert.equal(validateEvent({ type: 'puzzle.attempt', chapter: 'ch3', puzzle: 'P 4!' }).ok, false);
});

test('non-object input rejected', () => {
  assert.equal(validateEvent(null).ok, false);
  assert.equal(validateEvent('x').ok, false);
  assert.equal(validateEvent({}).ok, false);
});

import { emitMetricFor } from '../server/events.js';

function fakeMetrics() {
  const calls = [];
  return {
    calls,
    increment(name, tags) { calls.push({ kind: 'increment', name, tags }); },
    timing(name, ms, tags) { calls.push({ kind: 'timing', name, ms, tags }); },
  };
}

test('emitMetricFor: puzzle.attempt emits counter', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'puzzle.attempt', chapter: 'ch3', puzzle: 'p4' }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.puzzle.attempt', tags: { chapter: 'ch3', puzzle: 'p4' } },
  ]);
});

test('emitMetricFor: puzzle.solved emits counter + distribution', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 3 }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.puzzle.solved', tags: { chapter: 'ch3', puzzle: 'p4' } },
    { kind: 'timing', name: 'chrono.puzzle.attempts_to_solve', ms: 3, tags: { chapter: 'ch3', puzzle: 'p4' } },
  ]);
});

test('emitMetricFor: puzzle.failed includes reason tag', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'puzzle.failed', chapter: 'ch3', puzzle: 'p4', reason: 'wrong_result' }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.puzzle.failed', tags: { chapter: 'ch3', puzzle: 'p4', reason: 'wrong_result' } },
  ]);
});

test('emitMetricFor: hint.used emits counter', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'hint.used', chapter: 'ch3', puzzle: 'p4' }, m);
  assert.deepEqual(m.calls, [
    { kind: 'increment', name: 'chrono.hint.used', tags: { chapter: 'ch3', puzzle: 'p4' } },
  ]);
});

test('emitMetricFor: chapter.started / chapter.completed each emit one counter', () => {
  const m = fakeMetrics();
  emitMetricFor({ ok: true, type: 'chapter.started', chapter: 'ch3' }, m);
  emitMetricFor({ ok: true, type: 'chapter.completed', chapter: 'ch3' }, m);
  assert.equal(m.calls.length, 2);
  assert.equal(m.calls[0].name, 'chrono.chapter.started');
  assert.equal(m.calls[1].name, 'chrono.chapter.completed');
});
