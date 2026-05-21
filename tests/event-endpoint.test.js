import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let proc;
let port;

before(async () => {
  port = 5370 + Math.floor(Math.random() * 100);
  proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => { if (proc) proc.kill(); });

async function postEvent(body) {
  return fetch(`http://localhost:${port}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST /event accepts a valid puzzle.solved and returns 204', async () => {
  const res = await postEvent({ type: 'puzzle.solved', chapter: 'ch3', puzzle: 'p4', attempts: 2 });
  assert.equal(res.status, 204);
});

test('POST /event rejects unknown type', async () => {
  const res = await postEvent({ type: 'nope.nope', chapter: 'ch3' });
  assert.equal(res.status, 400);
});

test('POST /event rejects malformed chapter', async () => {
  const res = await postEvent({ type: 'chapter.started', chapter: 'BAD CHAPTER' });
  assert.equal(res.status, 400);
});

test('POST /event rejects empty body', async () => {
  const res = await postEvent('');
  assert.equal(res.status, 400);
});

test('GET /event returns 405', async () => {
  const res = await fetch(`http://localhost:${port}/event`);
  assert.equal(res.status, 405);
});
