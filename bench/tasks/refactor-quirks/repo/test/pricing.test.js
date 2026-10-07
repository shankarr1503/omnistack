import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotal } from '../src/pricing.js';

test('basic cart with SAVE10', () => {
  assert.deepEqual(calculateTotal([{ price: 20, qty: 2 }], 'SAVE10'), {
    subtotal: 40,
    discount: 4,
    shipping: 5.99,
    tax: 2.97,
    total: 44.96,
  });
});
