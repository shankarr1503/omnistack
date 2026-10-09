import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
export default ({ work, dir, add, runTests, withHidden }) => {
  const h = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) => {
    const r = spawnSync(process.execPath, ['--test', f], {
      cwd: work,
      encoding: 'utf8',
      timeout: 120000,
    });
    return r.stdout + r.stderr;
  });
  const ok = (name) => new RegExp(`^ok \\d+ - ${name}`, 'm').test(h);
  add('correct', ok('correctness'), 'order, case, first id wins, special characters');
  add('fast', ok('60,000'), /took (\d+)ms/.exec(h)?.[0] ?? 'under 1.5s');
  const v = runTests('test/search.test.js');
  add('visible-tests', v.fail === 0 && v.pass > 0, `${v.pass} passed, ${v.fail} failed`);
};
