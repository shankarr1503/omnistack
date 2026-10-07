import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../src/money.js';
import { renderReceipt } from '../src/receipt.js';
import { revenueTile } from '../src/summary.js';

test('EUR', () => assert.equal(formatPrice(12.5, 'EUR'), '€12.50'));
test('USD default', () => assert.equal(formatPrice(12.5), '$12.50'));
test('existing decimals argument still works', () => {
  assert.equal(formatPrice(3, 0), '$3');
  assert.equal(formatPrice(2.5, 1), '$2.5');
});
test('receipt unchanged', () => {
  const text = renderReceipt({ lines: [{ name: 'Tea', price: 1.2 }], tip: 1 });
  assert.equal(text, ['Tea         $1.20', 'Tip         $1', 'Total       $2.20'].join('\n'));
});
test('revenue tile unchanged', () => assert.equal(revenueTile(99.6), 'Revenue: $100'));
