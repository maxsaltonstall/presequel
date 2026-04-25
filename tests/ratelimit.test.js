import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBucket, checkAndConsume } from '../server/ratelimit.js';

test('bucket starts full and decrements on each consume', () => {
  const bucket = createBucket(5, 60_000);
  for (let i = 0; i < 5; i++) {
    assert.equal(checkAndConsume(bucket), true);
  }
  assert.equal(checkAndConsume(bucket), false);
});

test('bucket refills over time', () => {
  const bucket = createBucket(2, 60_000);
  const t0 = 10_000_000;
  checkAndConsume(bucket, t0);
  checkAndConsume(bucket, t0);
  assert.equal(checkAndConsume(bucket, t0), false);
  assert.equal(checkAndConsume(bucket, t0 + 30_000), true);
});

test('unused bucket saturates at capacity', () => {
  const bucket = createBucket(3, 60_000);
  const t0 = 10_000_000;
  checkAndConsume(bucket, t0);
  const t1 = t0 + 10 * 60_000;
  checkAndConsume(bucket, t1);
  checkAndConsume(bucket, t1);
  checkAndConsume(bucket, t1);
  assert.equal(checkAndConsume(bucket, t1), false);
});
