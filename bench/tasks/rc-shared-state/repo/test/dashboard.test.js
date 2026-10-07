import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboard } from '../src/dashboard.js';

const orders = () => [
  { customer: 'bo', amount: 25, date: '2024-01-01' },
  { customer: 'bo', amount: 25, date: '2024-01-02' },
  { customer: 'cy', amount: 50, date: '2024-01-03' },
  { customer: 'ana', amount: 100, date: '2024-01-04' },
];

test('dashboard totals', () => {
  const d = dashboard(orders());
  assert.equal(d.total, 200);
  assert.equal(d.count, 4);
});

test('ties go to the customer who ordered first', () => {
  assert.deepEqual(dashboard(orders()).top, ['ana', 'bo']);
});
