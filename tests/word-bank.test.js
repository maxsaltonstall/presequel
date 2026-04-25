import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialBank, fillFirstEmptySlot, returnSlotToBank,
} from '../src/puzzle.js';

const TEMPLATE = [
  { type: 'keyword', text: 'SELECT' },
  { type: 'blank', id: 'a', mode: 'word_bank', options: ['x', 'y', 'z'] },
  { type: 'keyword', text: 'FROM' },
  { type: 'blank', id: 'b', mode: 'word_bank', options: ['p', 'q'] },
];

test('buildInitialBank pools every blank option', () => {
  const bank = buildInitialBank(TEMPLATE);
  bank.sort();
  assert.deepEqual(bank, ['p', 'q', 'x', 'y', 'z']);
});

test('fillFirstEmptySlot fills slot a when all empty', () => {
  const result = fillFirstEmptySlot(TEMPLATE, {}, ['p','q','x','y','z'], 'x');
  assert.equal(result.blanks.a, 'x');
  assert.equal(result.blanks.b, undefined);
  assert.deepEqual(result.bank.sort(), ['p','q','y','z']);
});

test('fillFirstEmptySlot fills slot b when a is already filled', () => {
  const result = fillFirstEmptySlot(TEMPLATE, { a: 'x' }, ['p','q','y','z'], 'p');
  assert.equal(result.blanks.a, 'x');
  assert.equal(result.blanks.b, 'p');
  assert.deepEqual(result.bank.sort(), ['q','y','z']);
});

test('fillFirstEmptySlot is a no-op when all slots are filled', () => {
  const result = fillFirstEmptySlot(TEMPLATE, { a: 'x', b: 'p' }, ['q','y','z'], 'y');
  assert.deepEqual(result.blanks, { a: 'x', b: 'p' });
  assert.deepEqual(result.bank, ['q','y','z']);
});

test('fillFirstEmptySlot no-op if token is not in bank', () => {
  const result = fillFirstEmptySlot(TEMPLATE, {}, ['p','q'], 'x');
  assert.deepEqual(result.blanks, {});
  assert.deepEqual(result.bank, ['p','q']);
});

test('returnSlotToBank empties the slot and appends token to bank end', () => {
  const result = returnSlotToBank(TEMPLATE, { a: 'x', b: 'p' }, ['q','y','z'], 'b');
  assert.equal(result.blanks.a, 'x');
  assert.equal(result.blanks.b, undefined);
  assert.equal(result.bank[result.bank.length - 1], 'p');
  assert.equal(result.bank.length, 4);
});

test('returnSlotToBank is a no-op if slot is already empty', () => {
  const result = returnSlotToBank(TEMPLATE, { a: 'x' }, ['q','y','z','p'], 'b');
  assert.deepEqual(result.blanks, { a: 'x' });
  assert.deepEqual(result.bank, ['q','y','z','p']);
});

test('duplicate tokens in pool are preserved', () => {
  const tmpl = [
    { type: 'blank', id: 'c1', mode: 'word_bank', options: ['year', 'amount'] },
    { type: 'blank', id: 'c2', mode: 'word_bank', options: ['year', 'name'] },
  ];
  const bank = buildInitialBank(tmpl);
  assert.equal(bank.filter(t => t === 'year').length, 2);
});
