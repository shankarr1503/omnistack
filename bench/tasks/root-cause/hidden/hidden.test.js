import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/parse.js';
import { formatSummary } from '../src/summary.js';
import { validate } from '../src/validate.js';

test('keys are case-insensitive in the summary', () => {
  assert.equal(formatSummary(parseConfig('Timeout=30;Retries=2')), 'timeout=30s retries=2');
});
test('keys are case-insensitive for validation too', () => {
  assert.deepEqual(validate(parseConfig('TIMEOUT=5')), []);
});
test('lowercase still works', () => {
  assert.equal(formatSummary(parseConfig('timeout=7')), 'timeout=7s retries=0');
});
