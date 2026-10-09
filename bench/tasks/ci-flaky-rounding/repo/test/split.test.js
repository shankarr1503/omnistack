import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBill } from '../src/split.js';

test('shares add up to the total', () => {
  const total = Math.floor(Math.random() * 10000);
  const people = 1 + Math.floor(Math.random() * 6);
  const shares = splitBill(total, people);
  assert.equal(shares.length, people);
  assert.equal(
    shares.reduce((a, b) => a + b, 0),
    total,
  );
});

test('even split', () => {
  assert.deepEqual(splitBill(900, 3), [300, 300, 300]);
});
