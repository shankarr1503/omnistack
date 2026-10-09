import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBill } from '../src/split.js';

test('every total 0..3000 for 1..7 people splits exactly, within one cent, larger first', () => {
  for (let people = 1; people <= 7; people++)
    for (let total = 0; total <= 3000; total++) {
      const shares = splitBill(total, people);
      assert.equal(shares.length, people);
      assert.equal(
        shares.reduce((a, b) => a + b, 0),
        total,
        `${total}/${people}`,
      );
      assert.ok(shares.every(Number.isInteger));
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, `${total}/${people}`);
      for (let i = 1; i < shares.length; i++)
        assert.ok(shares[i - 1] >= shares[i], `${total}/${people} order`);
    }
});
test('examples', () => {
  assert.deepEqual(splitBill(1000, 3), [334, 333, 333]);
  assert.deepEqual(splitBill(5, 3), [2, 2, 1]);
});
