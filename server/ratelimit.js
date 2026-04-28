export function createBucket(capacity, refillMs) {
  return {
    capacity,
    refillRatePerMs: capacity / refillMs,
    tokens: capacity,
    lastRefillAt: null,
  };
}

export function checkAndConsume(bucket, nowMs) {
  const now = nowMs ?? Date.now();
  if (bucket.lastRefillAt === null) {
    bucket.lastRefillAt = now;
  } else {
    const elapsed = now - bucket.lastRefillAt;
    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + elapsed * bucket.refillRatePerMs,
    );
    bucket.lastRefillAt = now;
  }
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

const buckets = new Map();
const CAPACITY = Number(process.env.RATE_LIMIT_CAPACITY) || 30;
const REFILL_MS = 60_000;

export function allowRequest(ip) {
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = createBucket(CAPACITY, REFILL_MS);
    buckets.set(ip, bucket);
  }
  return checkAndConsume(bucket);
}

export function bucketCount() { return buckets.size; }
