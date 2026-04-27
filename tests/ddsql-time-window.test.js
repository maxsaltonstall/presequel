import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateTimeWindow, translateBucket } from '../server/ddsql.js';

// translateTimeWindow — basic cases
test('now-1h to now → 1-hour interval', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-1h to now]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hours' AND timestamp <= getvariable('ch8_anchor')"
  );
});

test('now-3h to now → 3-hour interval', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-3h to now]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '3 hours' AND timestamp <= getvariable('ch8_anchor')"
  );
});

test('now-2h to now-1h → both bounds translated', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-2h to now-1h]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '2 hours' AND timestamp <= getvariable('ch8_anchor') - INTERVAL '1 hours'"
  );
});

test('now-5m to now → minutes unit', () => {
  assert.equal(
    translateTimeWindow("SELECT * FROM logs WHERE @timestamp:[now-5m to now]"),
    "SELECT * FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '5 minutes' AND timestamp <= getvariable('ch8_anchor')"
  );
});

// translateTimeWindow — pass-through
test('pass-through: no @timestamp in SQL → unchanged', () => {
  const sql = "SELECT * FROM logs WHERE tags['level'] = 'error'";
  assert.equal(translateTimeWindow(sql), sql);
});

test('pass-through: @timestamp with unrecognised bracket content → unchanged', () => {
  const sql = "SELECT * FROM logs WHERE @timestamp:[yesterday to today]";
  assert.equal(translateTimeWindow(sql), sql);
});

// translateBucket — basic cases
test('bucket(timestamp, 1m) → DATE_TRUNC minute', () => {
  assert.equal(
    translateBucket("SELECT bucket(timestamp, 1m) AS minute FROM logs"),
    "SELECT DATE_TRUNC('minute', timestamp) AS minute FROM logs"
  );
});

test('bucket(timestamp, 1h) → DATE_TRUNC hour', () => {
  assert.equal(
    translateBucket("SELECT bucket(timestamp, 1h) AS hour FROM logs"),
    "SELECT DATE_TRUNC('hour', timestamp) AS hour FROM logs"
  );
});

test('bucket(timestamp, 1s) → DATE_TRUNC second', () => {
  assert.equal(
    translateBucket("SELECT bucket(timestamp, 1s) AS second FROM logs"),
    "SELECT DATE_TRUNC('second', timestamp) AS second FROM logs"
  );
});

test('bucket in GROUP BY position → rewritten', () => {
  assert.equal(
    translateBucket("SELECT bucket(ts, 1m), COUNT(*) FROM logs GROUP BY bucket(ts, 1m)"),
    "SELECT DATE_TRUNC('minute', ts), COUNT(*) FROM logs GROUP BY DATE_TRUNC('minute', ts)"
  );
});

test('pass-through: bucket with unrecognised interval → unchanged', () => {
  const sql = "SELECT bucket(timestamp, 5m) FROM logs";
  assert.equal(translateBucket(sql), sql);
});

// Composition
test('composition: @timestamp and bucket both rewritten correctly', () => {
  const input = "SELECT bucket(timestamp, 1m) AS minute, COUNT(*) AS n FROM logs WHERE @timestamp:[now-1h to now] GROUP BY minute ORDER BY minute";
  const expected = "SELECT DATE_TRUNC('minute', timestamp) AS minute, COUNT(*) AS n FROM logs WHERE timestamp >= getvariable('ch8_anchor') - INTERVAL '1 hours' AND timestamp <= getvariable('ch8_anchor') GROUP BY minute ORDER BY minute";
  assert.equal(translateBucket(translateTimeWindow(input)), expected);
});
