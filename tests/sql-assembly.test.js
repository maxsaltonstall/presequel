import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleSql } from '../src/puzzle.js';

test('assembles a fully-filled template', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'text', text: 'name' },
    { type: 'keyword', text: 'FROM' },
    { type: 'blank', id: 'tbl', mode: 'dropdown', options: ['clients', 'x'] },
  ];
  const blanks = { tbl: 'clients' };
  assert.equal(assembleSql(tmpl, blanks), 'SELECT name FROM clients');
});

test('WHERE clause with three blanks', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' }, { type: 'text', text: '*' },
    { type: 'keyword', text: 'FROM' },   { type: 'text', text: 't' },
    { type: 'keyword', text: 'WHERE' },
    { type: 'blank', id: 'c', mode: 'dropdown', options: ['a', 'b'] },
    { type: 'blank', id: 'op', mode: 'dropdown', options: ['=', '>'] },
    { type: 'blank', id: 'v', mode: 'dropdown', options: ['1', '2'] },
  ];
  const blanks = { c: 'a', op: '>', v: '1' };
  assert.equal(assembleSql(tmpl, blanks), 'SELECT * FROM t WHERE a > 1');
});

test('unfilled blank yields empty string (assembly still works; caller checks "all filled")', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank', id: 'c', mode: 'dropdown', options: ['a'] },
  ];
  assert.equal(assembleSql(tmpl, {}), 'SELECT');
});

test('typed blank with a function call value', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank',   id: 'col', mode: 'typed' },
    { type: 'keyword', text: 'FROM' },
    { type: 'text',    text: 'visits' },
  ];
  const blanks = { col: 'COUNT(DISTINCT patron_id)' };
  assert.equal(
    assembleSql(tmpl, blanks),
    'SELECT COUNT(DISTINCT patron_id) FROM visits',
  );
});

test('typed blank with extract expression', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank',   id: 'expr', mode: 'typed' },
    { type: 'text',    text: 'AS month' },
    { type: 'keyword', text: 'FROM' },
    { type: 'text',    text: 'visits' },
  ];
  const blanks = { expr: 'EXTRACT(MONTH FROM visit_date)' };
  assert.equal(
    assembleSql(tmpl, blanks),
    'SELECT EXTRACT(MONTH FROM visit_date) AS month FROM visits',
  );
});

test('typed blank trims interior multi-whitespace from typed value', () => {
  const tmpl = [
    { type: 'keyword', text: 'SELECT' },
    { type: 'blank',   id: 'col', mode: 'typed' },
    { type: 'keyword', text: 'FROM' },
    { type: 'text',    text: 't' },
  ];
  const blanks = { col: 'COUNT(*)   AS   n' };
  assert.equal(
    assembleSql(tmpl, blanks),
    'SELECT COUNT(*) AS n FROM t',
  );
});
