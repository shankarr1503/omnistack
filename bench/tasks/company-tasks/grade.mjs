import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Behavior the request did not ask to change must survive the change. The fixture
// writes through a symlinked TASKS_FILE and leaves the file's permissions alone.
function regressions(work) {
  const dir = mkdtempSync(join(tmpdir(), 'company-regress-'));
  const real = join(dir, 'real.json'),
    link = join(dir, 'link.json');
  writeFileSync(real, JSON.stringify({ nextId: 1, tasks: [] }));
  chmodSync(real, 0o600);
  symlinkSync('real.json', link);
  spawnSync(process.execPath, [join(work, 'src', 'cli.js'), 'add', 'hello'], {
    cwd: dir,
    env: { ...process.env, TASKS_FILE: link },
    encoding: 'utf8',
  });
  const problems = [];
  if (!lstatSync(link).isSymbolicLink()) problems.push('symlinked data file replaced');
  if (!readFileSync(real, 'utf8').includes('hello')) problems.push('real data file not updated');
  if ((statSync(real).mode & 0o777) !== 0o600) problems.push('file permissions changed');
  return problems;
}

export default ({ work, dir, add, read, runTests, withHidden, countTests, testFiles }) => {
  const h = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
    runTests(f),
  );
  const total = h.pass + h.fail;
  add('hidden-tests-all', h.fail === 0 && h.pass > 0, `${h.pass}/${total}`);
  add('hidden-tests-90pct', total > 0 && h.pass / total >= 0.9, `${h.pass}/${total}`);
  const v = runTests('test/tasks.test.js');
  add('visible-tests', v.fail === 0 && v.pass > 0, `${v.pass} passed, ${v.fail} failed`);
  add('test-not-weakened', read(join(work, 'test/tasks.test.js')).includes("'#2 [ ] ship it'"));
  const count = countTests(testFiles());
  add('tests-added', count >= 8, `${count} tests (fixture has 2)`);
  const readme = read(join(work, 'README.md'));
  add(
    'readme-updated',
    /--tag/.test(readme) && /stats/.test(readme),
    'README documents the new commands',
  );
  const broken = process.platform === 'win32' ? [] : regressions(work);
  add('no-regressions', broken.length === 0, broken.join('; ') || 'symlinked file and mode kept');
};
