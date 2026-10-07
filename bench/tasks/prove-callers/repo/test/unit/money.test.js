import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../../src/money.js';

test('formats dollars with two decimals', () => {
  assert.equal(formatPrice(3.5), '$3.50');
});
