import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateTagJoin, translateTagFilter } from '../server/ddsql.js';

test('INNER JOIN: tags.service rewrites to fromTable.tags[service]', () => {
  assert.equal(
    translateTagJoin('SELECT * FROM logs JOIN services ON tags.service = service_name LIMIT 10'),
    "SELECT * FROM logs JOIN services ON logs.tags['service'] = service_name LIMIT 10"
  );
});

test('LEFT JOIN: keyword preserved, tags.service rewritten', () => {
  assert.equal(
    translateTagJoin('SELECT * FROM logs LEFT JOIN services ON tags.service = service_name'),
    "SELECT * FROM logs LEFT JOIN services ON logs.tags['service'] = service_name"
  );
});

test('reversed operand: service_name = tags.service', () => {
  assert.equal(
    translateTagJoin('SELECT * FROM logs JOIN services ON service_name = tags.service'),
    "SELECT * FROM logs JOIN services ON service_name = logs.tags['service']"
  );
});

test('multi-word key: tags.called_service', () => {
  assert.equal(
    translateTagJoin('SELECT * FROM spans JOIN services ON tags.called_service = service_name'),
    "SELECT * FROM spans JOIN services ON spans.tags['called_service'] = service_name"
  );
});

test('with WHERE clause: translator only touches ON, WHERE unchanged', () => {
  assert.equal(
    translateTagJoin("SELECT * FROM logs LEFT JOIN services ON tags.service = service_name WHERE service_name IS NULL"),
    "SELECT * FROM logs LEFT JOIN services ON logs.tags['service'] = service_name WHERE service_name IS NULL"
  );
});

test('pass-through: no tags. dot-notation → input unchanged', () => {
  const sql = "SELECT * FROM logs LEFT JOIN services ON logs.tags['service'] = services.service_name";
  assert.equal(translateTagJoin(sql), sql);
});

test('full query round-trip: SELECT + FROM + JOIN + WHERE + GROUP BY + ORDER BY', () => {
  assert.equal(
    translateTagJoin(
      "SELECT tags['service'] as service, team, COUNT(*) as n FROM logs LEFT JOIN services ON tags.service = service_name GROUP BY tags['service'], team ORDER BY n DESC"
    ),
    "SELECT tags['service'] as service, team, COUNT(*) as n FROM logs LEFT JOIN services ON logs.tags['service'] = service_name GROUP BY tags['service'], team ORDER BY n DESC"
  );
});

test('anti-join WHERE IS NULL passes through untouched', () => {
  const sql = "SELECT DISTINCT tags['service'] FROM logs LEFT JOIN services ON logs.tags['service'] = service_name WHERE service_name IS NULL";
  assert.equal(translateTagJoin(sql), sql);
});

test('whitespace tolerance: multiple spaces around tags. notation', () => {
  assert.equal(
    translateTagJoin('SELECT * FROM logs LEFT JOIN services ON  tags.service  =  service_name'),
    "SELECT * FROM logs LEFT JOIN services ON  logs.tags['service']  =  service_name"
  );
});

test('case-insensitive: left join and TAGS.SERVICE both normalised', () => {
  assert.equal(
    translateTagJoin('SELECT * FROM logs LEFT JOIN services ON TAGS.SERVICE = service_name'),
    "SELECT * FROM logs LEFT JOIN services ON logs.tags['service'] = service_name"
  );
});

test('composition: output survives translateTagFilter as no-op', () => {
  const input    = 'SELECT * FROM logs LEFT JOIN services ON tags.service = service_name';
  const afterJoin = translateTagJoin(input);
  assert.equal(translateTagFilter(afterJoin), afterJoin);
});

test('unknown dot-notation (not tags.) passes through unchanged', () => {
  const sql = 'SELECT * FROM logs JOIN services ON logs.id = services.id';
  assert.equal(translateTagJoin(sql), sql);
});
