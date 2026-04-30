import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatePTF, translateTagFilter } from '../server/ddsql.js';

test('logs(service:auth-svc) → FROM logs WHERE tag condition', () => {
  assert.equal(
    translatePTF('SELECT timestamp, message FROM logs(service:auth-svc) LIMIT 10'),
    "SELECT timestamp, message FROM logs WHERE tags['service'] = 'auth-svc' LIMIT 10"
  );
});

test('spans(service:chrono-portal-mirror) → FROM spans WHERE tag condition', () => {
  assert.equal(
    translatePTF('SELECT trace_id FROM spans(service:chrono-portal-mirror) LIMIT 10'),
    "SELECT trace_id FROM spans WHERE tags['service'] = 'chrono-portal-mirror' LIMIT 10"
  );
});

test('multi-tag args → AND-joined conditions', () => {
  assert.equal(
    translatePTF('SELECT timestamp FROM logs(service:auth-svc level:error) LIMIT 5'),
    "SELECT timestamp FROM logs WHERE tags['service'] = 'auth-svc' AND tags['level'] = 'error' LIMIT 5"
  );
});

test('no-arg PTF: FROM logs() → FROM logs', () => {
  assert.equal(
    translatePTF('SELECT * FROM logs() LIMIT 10'),
    'SELECT * FROM logs LIMIT 10'
  );
});

test('case-insensitive PTF name: FROM LOGS(...) → lowercase table', () => {
  assert.equal(
    translatePTF('SELECT * FROM LOGS(service:auth-svc) LIMIT 10'),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' LIMIT 10"
  );
});

test('unknown PTF name throws typed error', () => {
  assert.throws(
    () => translatePTF('SELECT * FROM traces(service:x) LIMIT 10'),
    /Unknown PTF/
  );
});

test('non-PTF input passes through unchanged', () => {
  const sql = "SELECT * FROM logs WHERE tags['service'] = 'auth-svc'";
  assert.equal(translatePTF(sql), sql);
});

test('composition: PTF output survives translateTagFilter as no-op', () => {
  const input    = 'SELECT timestamp FROM logs(service:auth-svc) LIMIT 10';
  const afterPTF = translatePTF(input);
  assert.equal(translateTagFilter(afterPTF), afterPTF);
});

test('PTF with existing WHERE clause — args merged with AND', () => {
  assert.equal(
    translatePTF("SELECT * FROM logs(service:auth-svc) WHERE level = 'error'"),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' AND level = 'error'"
  );
});

test('spans() with multi-tag args', () => {
  assert.equal(
    translatePTF('SELECT * FROM spans(service:chrono-portal-mirror env:prod) LIMIT 10'),
    "SELECT * FROM spans WHERE tags['service'] = 'chrono-portal-mirror' AND tags['env'] = 'prod' LIMIT 10"
  );
});

test('whitespace tolerance: FROM logs( service:auth-svc ) → correct', () => {
  assert.equal(
    translatePTF('SELECT * FROM logs( service:auth-svc ) LIMIT 10'),
    "SELECT * FROM logs WHERE tags['service'] = 'auth-svc' LIMIT 10"
  );
});

test('negation tag: FROM logs(-level:info) → != condition', () => {
  assert.equal(
    translatePTF('SELECT * FROM logs(-level:info) LIMIT 10'),
    "SELECT * FROM logs WHERE tags['level'] != 'info' LIMIT 10"
  );
});
