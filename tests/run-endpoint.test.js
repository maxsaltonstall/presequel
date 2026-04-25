import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let proc;
let port;

before(async () => {
  port = 5270 + Math.floor(Math.random() * 100);
  proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for server to be ready (poll)
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => {
  if (proc) proc.kill();
});

test('POST /run returns 400 without body', async () => {
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error);
});

test('POST /run echoes chapter and sql in dev mode (placeholder)', async () => {
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter: '01-onboarding', sql: 'SELECT 1' }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(typeof json.rows, 'object');
});
