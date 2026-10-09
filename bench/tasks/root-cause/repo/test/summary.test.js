import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/parse.js';
import { formatSummary } from '../src/summary.js';

test('summary of a simple config', () => {
  assert.equal(formatSummary(parseConfig('timeout=30;retries=2')), 'timeout=30s retries=2');
});

test('summary does not crash for user-written configs', () => {
  assert.doesNotThrow(() => formatSummary(parseConfig('Timeout=30;Retries=2')));
});
