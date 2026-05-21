import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub global fetch and rum module before importing the SUT.
async function loadTelemetryWith({ rumActions, fetchImpl }) {
  globalThis.fetch = fetchImpl;
  // Use a query string to bust ESM cache between test cases.
  const mod = await import(`../src/telemetry.js?case=${Math.random()}`);
  // Inject our rumAction stub by reassigning the imported reference is not possible;
  // instead we rely on telemetry.js exposing a setter for tests.
  mod.__setRumActionForTesting(rumActions);
  return mod;
}

test('emit fans out to rumAction and POST /event', async () => {
  const rumActions = [];
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 204 };
  };
  const { emit } = await loadTelemetryWith({
    rumActions: (name, attrs) => rumActions.push({ name, attrs }),
    fetchImpl,
  });

  await emit('puzzle.solved', { chapter: 'ch3', puzzle: 'p4', attempts: 3 });

  assert.deepEqual(rumActions, [
    { name: 'puzzle.solved', attrs: { chapter: 'ch3', puzzle: 'p4', attempts: 3 } },
  ]);
  const eventReq = requests.find(r => r.url === '/event');
  assert.ok(eventReq, 'expected a POST /event request');
  assert.equal(eventReq.init.method, 'POST');
  assert.deepEqual(JSON.parse(eventReq.init.body), {
    type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 3,
  });
});

test('emit swallows fetch errors', async () => {
  const fetchImpl = async () => { throw new Error('network'); };
  const { emit } = await loadTelemetryWith({
    rumActions: () => {},
    fetchImpl,
  });
  await assert.doesNotReject(emit('hint.used', { chapter: 'ch3', puzzle: 'p4' }));
});
