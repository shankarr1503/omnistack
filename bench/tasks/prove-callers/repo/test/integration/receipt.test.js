import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReceipt } from '../../src/receipt.js';
import { revenueTile } from '../../src/summary.js';

test('receipt layout', () => {
  const text = renderReceipt({
    lines: [
      { name: 'Coffee', price: 3.5 },
      { name: 'Bagel', price: 2.25 },
    ],
    tip: 2,
  });
  assert.equal(
    text,
    ['Coffee      $3.50', 'Bagel       $2.25', 'Tip         $2', 'Total       $7.75'].join('\n'),
  );
});

test('revenue tile shows whole dollars', () => {
  assert.equal(revenueTile(1234.4), 'Revenue: $1234');
});
