import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, groupByDay } from '../src/day.js';

test('late-evening UTC events stay on their UTC day', () => {
  assert.equal(dayKey('2024-03-10T23:30:00Z'), '2024-03-10');
});

test('events are grouped by UTC day', () => {
  const groups = groupByDay([
    { at: '2024-03-10T00:15:00Z' },
    { at: '2024-03-10T23:45:00Z' },
    { at: '2024-03-11T00:05:00Z' },
  ]);
  assert.deepEqual(Object.keys(groups).sort(), ['2024-03-10', '2024-03-11']);
  assert.equal(groups['2024-03-10'].length, 2);
});

test('early-morning UTC events stay on their UTC day', () => {
  assert.equal(dayKey('2024-07-01T00:30:00Z'), '2024-07-01');
});
test('offset timestamps are converted to the UTC day', () => {
  assert.equal(dayKey('2024-03-10T20:30:00-05:00'), '2024-03-11');
});
