import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let proc;
let port;

async function run(sql, chapter = '01-onboarding') {
  const res = await fetch(`http://localhost:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter, sql }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

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

test('benign SELECT succeeds', async () => {
  const { status, json } = await run('SELECT COUNT(*) FROM clients');
  assert.equal(status, 200);
  assert.equal(json.rows[0][0], 20);
});

test('DROP TABLE rejected (400)', async () => {
  const { status, json } = await run('DROP TABLE clients');
  assert.equal(status, 400);
  assert.match(json.error, /only select/i);
});

test('read_csv rejected at validator (400)', async () => {
  const { status, json } = await run("SELECT * FROM read_csv('/etc/hostname')");
  assert.equal(status, 400);
  assert.match(json.error, /not allowed|blocked|filesystem/i);
});

test('LOAD extension rejected (400)', async () => {
  const { status, json } = await run('LOAD httpfs');
  assert.equal(status, 400);
});

test('COPY to disk rejected (400)', async () => {
  const { status, json } = await run("COPY clients TO '/tmp/x.csv'");
  assert.equal(status, 400);
});

test('stacked statement rejected (400)', async () => {
  const { status, json } = await run('SELECT 1; DROP TABLE clients');
  assert.equal(status, 400);
});

test('oversized body rejected (400)', async () => {
  const big = 'SELECT ' + 'x, '.repeat(30000) + '1';
  try {
    const res = await fetch(`http://localhost:${port}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter: '01-onboarding', sql: big }),
    });
    assert.equal(res.status, 400);
  } catch (err) {
    // Socket error is expected when server kills connection for oversized body
    assert.match(err.cause?.code || err.message, /UND_ERR_SOCKET|socket|closed|destroy/i);
  }
});

test('huge result is truncated (200 with truncated flag)', async () => {
  const { status, json } = await run('SELECT * FROM range(20000)');
  assert.equal(status, 200);
  assert.equal(json.truncated, true);
  assert.equal(json.rows.length, 10000);
});
