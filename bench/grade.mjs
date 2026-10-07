#!/usr/bin/env node
// Usage: node bench/grade.mjs <task> <workdir>
// Prints {task, score, max, checks:[{id, pass, note}]} as JSON.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const [task, workdirArg] = process.argv.slice(2);
const dir = resolve(import.meta.dirname, 'tasks', task);
const work = resolve(workdirArg);
const checks = [];
const add = (id, pass, note = '') => checks.push({ id, pass: !!pass, note });
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

function runTests(file, env = {}) {
  const r = spawnSync(process.execPath, ['--test', file], {
    cwd: work,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 60000,
  });
  const out = r.stdout + r.stderr;
  return {
    pass: Number(/^# pass (\d+)/m.exec(out)?.[1] ?? 0),
    fail: Number(/^# fail (\d+)/m.exec(out)?.[1] ?? 0),
  };
}
function withHidden(src, dest, fn) {
  cpSync(src, join(work, dest));
  try {
    return fn(dest);
  } finally {
    rmSync(join(work, dest), { force: true });
  }
}
function originalFile(path) {
  try {
    return execFileSync('git', ['show', `HEAD:${path}`], { cwd: work, encoding: 'utf8' });
  } catch {
    return '';
  }
}
/** A finding counts only if all its patterns match inside one paragraph or list item. */
function findIssues(text, issues) {
  const blocks = text.split(/\n\s*\n|\n(?=\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|\|))/);
  for (const issue of issues) {
    const hit = blocks.some((b) => issue.patterns.every((p) => new RegExp(p, 'i').test(b)));
    add(issue.id, hit, issue.desc);
  }
}

if (task === 'root-cause') {
  const r = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
    runTests(f),
  );
  add('hidden-tests', r.fail === 0 && r.pass > 0, `${r.pass} passed, ${r.fail} failed`);
  const v = runTests('test/summary.test.js');
  add('visible-tests', v.fail === 0 && v.pass > 0, `${v.pass} passed, ${v.fail} failed`);
  add(
    'test-not-weakened',
    read(join(work, 'test/summary.test.js')) === originalFile('test/summary.test.js') ||
      /Timeout=30;Retries=2/.test(read(join(work, 'test/summary.test.js'))),
  );
  add(
    'regression-test-added',
    readdirSync(join(work, 'test')).length > 1 ||
      read(join(work, 'test/summary.test.js')).split('test(').length > 3,
    'new test for the cause',
  );
} else if (task === 'test-first') {
  mkdirSync(join(work, 'test'), { recursive: true });
  const r = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
    runTests(f),
  );
  const total = r.pass + r.fail;
  add('hidden-tests-all', r.fail === 0 && r.pass > 0, `${r.pass}/${total}`);
  add('hidden-tests-90pct', total && r.pass / total >= 0.9, `${r.pass}/${total}`);
  const own = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--cached'], {
    cwd: work,
    encoding: 'utf8',
  })
    .stdout.split('\n')
    .filter((f) => /test/.test(f) && f.endsWith('.js'));
  const count = own.reduce(
    (n, f) => n + (read(join(work, f)).match(/\btest\(|\bit\(/g)?.length ?? 0),
    0,
  );
  add('own-tests-written', count >= 8, `${count} tests in ${own.length} file(s)`);
  if (own.length) {
    const t = runTests(own[0]);
    add('own-tests-pass', t.fail === 0 && t.pass > 0, `${t.pass} passed, ${t.fail} failed`);
  } else add('own-tests-pass', false, 'no test file');
} else if (task === 'ship-review' || task === 'threat-check') {
  const report = read(join(work, 'REPORT.md'));
  add('report-written', report.length > 200);
  findIssues(report, JSON.parse(read(join(dir, 'expected.json'))).issues);
  if (task === 'ship-review')
    add(
      'verdict-not-ship',
      /(do not ship|don't ship|not safe|not ready|do not merge|don't merge|ship after fix|block|request(ed)? changes|needs? (changes|fixes))/i.test(
        report,
      ),
      'verdict',
    );
} else if (task === 'safe-migration') {
  // Recursive: some plans keep later contract steps in a subfolder (e.g. migrations/deferred/).
  const migrations = readdirSync(join(work, 'migrations'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== '0001_create_users.sql')
    .map((e) => read(join(e.parentPath, e.name)))
    .join('\n');
  const all = [
    migrations,
    read(join(work, 'MIGRATION_PLAN.md')),
    read(join(work, 'REPORT.md')),
  ].join('\n');
  for (const c of JSON.parse(read(join(dir, 'expected.json'))).checks) {
    const re = new RegExp(c.pattern, 'i');
    const pass =
      c.type === 'absent_in_migrations'
        ? migrations.length > 0 && !re.test(migrations)
        : c.type === 'present_in_migrations'
          ? re.test(migrations)
          : re.test(all);
    add(c.id, pass, c.desc);
  }
} else if (task === 'fix-ci') {
  for (const tz of ['UTC', 'Europe/Berlin', 'America/Los_Angeles', 'Asia/Kolkata']) {
    const r = withHidden(join(dir, 'hidden/day.test.js'), 'test/zz_hidden.test.js', (f) =>
      runTests(f, { TZ: tz }),
    );
    add(`hidden-${tz}`, r.fail === 0 && r.pass > 0, `${r.pass} passed, ${r.fail} failed`);
  }
  const visible = read(join(work, 'test/day.test.js'));
  add(
    'test-not-weakened',
    visible.includes("'2024-03-10T23:30:00Z'), '2024-03-10'") &&
      !/\.skip|todo:|skip:/.test(visible),
  );
  const ci = read(join(work, '.github/workflows/ci.yml')) + read(join(work, 'package.json'));
  add('no-tz-pinning-workaround', !/\bTZ\s*[:=]/.test(ci), 'did not just pin TZ in CI/scripts');
} else throw new Error(`unknown task ${task}`);

const score = checks.filter((c) => c.pass).length;
console.log(JSON.stringify({ task, score, max: checks.length, checks }, null, 2));
