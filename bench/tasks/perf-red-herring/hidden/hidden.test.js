import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/search.js';

const records = [
  { id: 1, title: 'Red Apple', tags: ['fruit'] },
  { id: 2, title: 'a.b (special)', tags: ['x'] },
  { id: 1, title: 'Apple duplicate', tags: [] },
  { id: 3, title: 'Carrot', tags: ['Vegetable'] },
  { id: 4, title: 'Grape', tags: ['fruit', 'purple'] },
];

test('correctness: order, case-insensitivity, first id wins, special characters', () => {
  assert.deepEqual(
    search(records, 'apple').map((r) => r.title),
    ['Red Apple'],
  );
  assert.deepEqual(
    search(records, 'vegetable').map((r) => r.id),
    [3],
  );
  assert.deepEqual(
    search(records, 'fruit').map((r) => r.id),
    [1, 4],
  );
  assert.deepEqual(
    search(records, '(special)').map((r) => r.id),
    [2],
  );
  assert.deepEqual(search(records, 'zzz'), []);
});

test('60,000 matching records with duplicates search in under 1.5s', () => {
  const big = Array.from({ length: 60000 }, (_, i) => ({
    id: i % 50000,
    title: `Item ${i} alpha`,
    tags: ['bulk'],
  }));
  const started = performance.now();
  const result = search(big, 'a');
  const elapsed = performance.now() - started;
  assert.equal(result.length, 50000);
  assert.equal(result[0].title, 'Item 0 alpha');
  assert.ok(elapsed < 1500, `took ${Math.round(elapsed)}ms`);
});
