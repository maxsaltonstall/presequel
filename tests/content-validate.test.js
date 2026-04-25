import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('npm run validate-content exits 0 on current content', () => {
  const r = spawnSync('node', ['scripts/validate-content.js'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stdout, /Content valid/);
});
