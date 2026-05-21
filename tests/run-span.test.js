import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withChronoQuerySpan, __setTracerForTesting } from '../server/spans.js';

test('withChronoQuerySpan opens a span named chrono.query and sets supplied tags', async () => {
  const setTags = [];
  const fakeSpan = { setTag: (k, v) => setTags.push([k, v]) };
  let openedName = null;
  __setTracerForTesting({
    trace: (name, opts, fn) => {
      openedName = name;
      return fn(fakeSpan);
    },
  });

  const result = await withChronoQuerySpan(async (span) => {
    span.setTag('chapter', 'ch3');
    span.setTag('validation.ok', true);
    span.setTag('result.rows', 2);
    return 42;
  });

  assert.equal(openedName, 'chrono.query');
  assert.equal(result, 42);
  assert.deepEqual(setTags, [['chapter', 'ch3'], ['validation.ok', true], ['result.rows', 2]]);
});

test('withChronoQuerySpan re-throws and tags error', async () => {
  const setTags = [];
  const fakeSpan = { setTag: (k, v) => setTags.push([k, v]) };
  __setTracerForTesting({ trace: (name, opts, fn) => fn(fakeSpan) });

  await assert.rejects(async () => {
    await withChronoQuerySpan(async () => { throw new Error('boom'); });
  }, /boom/);
  const errTag = setTags.find(([k]) => k === 'error');
  assert.ok(errTag, 'expected error tag to be set');
});

test('withChronoQuerySpan is a no-op pass-through when tracer.trace is missing', async () => {
  __setTracerForTesting({}); // no .trace
  const result = await withChronoQuerySpan(async (span) => {
    span.setTag('chapter', 'ch3'); // must not throw
    return 'ok';
  });
  assert.equal(result, 'ok');
});
