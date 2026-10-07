import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/search.js';

const records = [
  { id: 1, title: 'Red Apple', tags: ['fruit'] },
  { id: 2, title: 'Banana', tags: ['fruit', 'yellow'] },
  { id: 1, title: 'Apple duplicate', tags: [] },
  { id: 3, title: 'Carrot', tags: ['vegetable', 'orange'] },
];

test('matches title or tags, case-insensitive, first id wins', () => {
  assert.deepEqual(
    search(records, 'apple').map((r) => r.title),
    ['Red Apple'],
  );
  assert.deepEqual(
    search(records, 'ORANGE').map((r) => r.id),
    [3],
  );
});
