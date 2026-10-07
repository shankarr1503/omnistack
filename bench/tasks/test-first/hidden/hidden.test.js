import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration as p } from '../src/duration.js';
const ok = [
  ['1h30m', 5400],
  ['45s', 45],
  ['2m10s', 130],
  ['10s1h', 3610],
  ['1h 30m', 5400],
  ['1.5h', 5400],
  ['90', 90],
  ['2H', 7200],
  ['0.5s', 1],
  ['  3m  ', 180],
  ['1h0m0s', 3600],
];
for (const [input, want] of ok)
  test(`parses ${JSON.stringify(input)}`, () => assert.equal(p(input), want));
const bad = ['', '   ', '5d', '1h2h', '-5s', 'h', '1hh', 'abc', '1h-30m', '1..5h'];
for (const input of bad)
  test(`rejects ${JSON.stringify(input)}`, () => assert.throws(() => p(input), RangeError));
