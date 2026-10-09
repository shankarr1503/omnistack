import { join } from 'node:path';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
export default ({ work, dir, add, runTests, withHidden, originalFile }) => {
  const h = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
    runTests(f),
  );
  add('hidden-tests', h.fail === 0 && h.pass > 0, `${h.pass} passed, ${h.fail} failed`);
  const v = runTests('test/**/*.test.js');
  add('own-tests-pass', v.fail === 0 && v.pass > 0, `${v.pass} passed, ${v.fail} failed`);
  // The agent's tests must still catch the original bug; a seeded or loosened test would not.
  const copy = mkdtempSync(join(tmpdir(), 'bench-flaky-'));
  try {
    cpSync(work, copy, { recursive: true, filter: (p) => !p.includes(`${join(work, '.git')}`) });
    writeFileSync(join(copy, 'src/split.js'), originalFile('src/split.js'));
    let failures = 0;
    for (let i = 0; i < 10; i++) {
      const r = spawnSync(process.execPath, ['--test', 'test/**/*.test.js'], {
        cwd: copy,
        encoding: 'utf8',
        timeout: 60000,
      });
      if (/^# fail [1-9]/m.test(r.stdout + r.stderr)) failures++;
    }
    add('tests-still-catch-bug', failures > 0, `original bug detected in ${failures}/10 runs`);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
};
