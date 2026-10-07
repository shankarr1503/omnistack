import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotal } from '../src/pricing.js';
import { calculateTotal as original } from './zz_original.js';

// Deterministic pseudo-random generator so every grading run sees the same carts.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const codes = [
  undefined,
  '',
  null,
  'SAVE10',
  'save10',
  'SAVE20',
  'SAVE20 ',
  'FLAT5',
  'FLAT5.9',
  'FLAT',
  'FLATabc',
  'FLAT999',
  'flat5',
  'XSAVE10',
  'FLAT-3',
];

test('identical results to the original on 2,000 random carts and edge cases', () => {
  const carts = [
    [],
    [{ price: 0.1, qty: 3 }],
    [{ price: 24.995, qty: 2 }],
    [{ price: 49.99, qty: 1 }],
    [{ price: 50, qty: 1 }],
  ];
  for (let i = 0; i < 2000; i++)
    carts.push(
      Array.from({ length: Math.floor(rand() * 5) }, () => ({
        price: Math.round(rand() * 8000) / 100 + (rand() < 0.2 ? 0.005 : 0),
        qty: 1 + Math.floor(rand() * 4),
      })),
    );
  let compared = 0;
  for (const cart of carts)
    for (const code of codes) {
      assert.deepEqual(
        calculateTotal(structuredClone(cart), code),
        original(structuredClone(cart), code),
        JSON.stringify({ cart, code }),
      );
      compared++;
    }
  assert.ok(compared > 30000);
});
