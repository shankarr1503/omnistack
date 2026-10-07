import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboard } from '../src/dashboard.js';
import { revenueReport } from '../src/orders.js';
import { topCustomers } from '../src/customers.js';

const sample = () => [
  { customer: 'zed', amount: 40, date: '2024-02-01' },
  { customer: 'amy', amount: 10, date: '2024-02-02' },
  { customer: 'amy', amount: 30, date: '2024-02-03' },
  { customer: 'kim', amount: 90, date: '2024-02-04' },
];

test("revenueReport does not modify the caller's orders", () => {
  const orders = sample();
  const before = structuredClone(orders);
  revenueReport(orders);
  assert.deepEqual(orders, before);
});
test('ties go to who ordered first, not alphabetical order', () => {
  assert.deepEqual(dashboard(sample()).top, ['kim', 'zed']);
  assert.deepEqual(topCustomers(sample(), 3), ['kim', 'zed', 'amy']);
});
test('since is the oldest order date', () => {
  assert.equal(dashboard(sample()).since, '2024-02-01');
});
test('report values are unchanged', () => {
  const r = revenueReport(sample());
  assert.equal(r.total, 170);
  assert.equal(r.largest.amount, 90);
  assert.equal(r.count, 4);
});
