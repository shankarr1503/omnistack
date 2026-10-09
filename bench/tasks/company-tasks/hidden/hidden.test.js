import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = join(process.cwd(), 'src', 'cli.js');
function fresh() {
  const file = join(mkdtempSync(join(tmpdir(), 'hidden-')), 'tasks.json');
  const run = (...args) => {
    const r = spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      env: { ...process.env, TASKS_FILE: file, TODAY: '2026-03-10' },
    });
    return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
  };
  return { file, run };
}
const lines = (s) => (s ? s.split('\n') : []);

test('backward compatible: plain add/list/done unchanged', () => {
  const { run } = fresh();
  assert.equal(run('add', 'write', 'docs').out, 'Added #1');
  run('done', '1');
  assert.deepEqual(lines(run('list').out), ['#1 [x] write docs']);
});
test('tags are shown in order after the title', () => {
  const { run } = fresh();
  assert.equal(run('add', 'pay rent', '--tag', 'home', '--tag', 'money').code, 0);
  assert.deepEqual(lines(run('list').out), ['#1 [ ] pay rent +home +money']);
});
test('options may come before the title words', () => {
  const { run } = fresh();
  run('add', '--tag', 'work', 'review', 'pr');
  assert.deepEqual(lines(run('list').out), ['#1 [ ] review pr +work']);
});
test('invalid tag is rejected with exit 1 and nothing saved', () => {
  const { run } = fresh();
  const r = run('add', 'x', '--tag', 'Bad Tag!');
  assert.equal(r.code, 1);
  assert.ok(r.err.length > 0, 'error message on stderr');
  assert.deepEqual(lines(run('list').out), []);
});
test('uppercase tag is rejected', () => {
  const { run } = fresh();
  assert.equal(run('add', 'x', '--tag', 'Work').code, 1);
});
test('due date shown after tags', () => {
  const { run } = fresh();
  run('add', 'file taxes', '--tag', 'money', '--due', '2026-04-15');
  assert.deepEqual(lines(run('list').out), ['#1 [ ] file taxes +money (due 2026-04-15)']);
});
test('impossible and malformed dates are rejected', () => {
  const { run } = fresh();
  for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', 'tomorrow', '2026-1-5']) {
    const r = run('add', 'x', '--due', bad);
    assert.equal(r.code, 1, `should reject ${bad}`);
  }
  assert.deepEqual(lines(run('list').out), []);
});
test('leap day is valid', () => {
  const { run } = fresh();
  assert.equal(run('add', 'x', '--due', '2028-02-29').code, 0);
});
test('filter by tag', () => {
  const { run } = fresh();
  run('add', 'a', '--tag', 'work');
  run('add', 'b', '--tag', 'home');
  run('add', 'c', '--tag', 'work', '--tag', 'home');
  assert.deepEqual(lines(run('list', '--tag', 'work').out), [
    '#1 [ ] a +work',
    '#3 [ ] c +work +home',
  ]);
});
test('overdue: open tasks due before TODAY only', () => {
  const { run } = fresh();
  run('add', 'late', '--due', '2026-03-09');
  run('add', 'today', '--due', '2026-03-10');
  run('add', 'future', '--due', '2026-03-11');
  run('add', 'late-done', '--due', '2026-01-01');
  run('done', '4');
  run('add', 'nodue');
  assert.deepEqual(lines(run('list', '--overdue').out), ['#1 [ ] late (due 2026-03-09)']);
});
test('tag and overdue filters combine', () => {
  const { run } = fresh();
  run('add', 'a', '--tag', 'work', '--due', '2026-03-01');
  run('add', 'b', '--tag', 'home', '--due', '2026-03-01');
  run('add', 'c', '--tag', 'work', '--due', '2026-04-01');
  assert.deepEqual(lines(run('list', '--tag', 'work', '--overdue').out), [
    '#1 [ ] a +work (due 2026-03-01)',
  ]);
});
test('stats exact format', () => {
  const { run } = fresh();
  run('add', 'a', '--tag', 'work', '--due', '2026-03-01');
  run('add', 'b', '--tag', 'home');
  run('add', 'c', '--tag', 'work', '--tag', 'alpha');
  run('done', '3');
  assert.deepEqual(lines(run('stats').out), [
    'total: 3',
    'open: 2',
    'done: 1',
    'overdue: 1',
    'tag alpha: 1',
    'tag home: 1',
    'tag work: 2',
  ]);
});
test('stats on empty list', () => {
  const { run } = fresh();
  assert.deepEqual(lines(run('stats').out), ['total: 0', 'open: 0', 'done: 0', 'overdue: 0']);
});
test('old tasks.json without tags or due keeps working', () => {
  const { file, run } = fresh();
  writeFileSync(
    file,
    JSON.stringify({
      nextId: 3,
      tasks: [
        { id: 1, title: 'old one', done: false },
        { id: 2, title: 'old two', done: true },
      ],
    }),
  );
  assert.deepEqual(lines(run('list').out), ['#1 [ ] old one', '#2 [x] old two']);
  assert.equal(run('add', 'new', '--tag', 'x').out, 'Added #3');
  assert.deepEqual(lines(run('list', '--tag', 'x').out), ['#3 [ ] new +x']);
  assert.deepEqual(lines(run('stats').out), [
    'total: 3',
    'open: 2',
    'done: 1',
    'overdue: 0',
    'tag x: 1',
  ]);
  assert.ok(readFileSync(file, 'utf8').includes('old one'));
});
