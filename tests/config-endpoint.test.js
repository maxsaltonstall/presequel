import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

function startServer(env) {
  const port = 5470 + Math.floor(Math.random() * 100);
  const proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { proc, port };
}

async function waitReady(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start');
}

test('GET /config returns enabled:false when RUM env vars missing', async () => {
  const { proc, port } = startServer({
    DD_RUM_APPLICATION_ID: '', DD_RUM_CLIENT_TOKEN: '',
  });
  try {
    await waitReady(port);
    const res = await fetch(`http://localhost:${port}/config`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, { enabled: false });
  } finally { proc.kill(); }
});

test('GET /config returns full config when RUM env vars present', async () => {
  const { proc, port } = startServer({
    DD_RUM_APPLICATION_ID: 'app-id-123',
    DD_RUM_CLIENT_TOKEN: 'tok-456',
    DD_SITE: 'datadoghq.com',
    DD_SERVICE: 'chrono-consulting',
    DD_ENV: 'staging',
    DD_VERSION: 'v1.2.3',
  });
  try {
    await waitReady(port);
    const res = await fetch(`http://localhost:${port}/config`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.applicationId, 'app-id-123');
    assert.equal(json.clientToken, 'tok-456');
    assert.equal(json.site, 'datadoghq.com');
    assert.equal(json.service, 'chrono-consulting');
    assert.equal(json.env, 'staging');
    assert.equal(json.version, 'v1.2.3');
  } finally { proc.kill(); }
});

test('POST /config returns 405', async () => {
  const { proc, port } = startServer({});
  try {
    await waitReady(port);
    const res = await fetch(`http://localhost:${port}/config`, { method: 'POST' });
    assert.equal(res.status, 405);
  } finally { proc.kill(); }
});
