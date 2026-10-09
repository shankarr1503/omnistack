import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TASKS_FILE = join(mkdtempSync(join(tmpdir(), 'tasks-')), 'tasks.json');
const { addTask, completeTask, formatTask, listTasks } = await import('../src/tasks.js');

test('add, list and complete tasks', () => {
  const a = addTask('write docs');
  addTask('ship it');
  completeTask(a.id);
  assert.deepEqual(listTasks().map(formatTask), ['#1 [x] write docs', '#2 [ ] ship it']);
});

test('rejects an empty title', () => {
  assert.throws(() => addTask('  '), /title is required/);
});
