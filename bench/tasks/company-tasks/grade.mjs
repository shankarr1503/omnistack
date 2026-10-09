import { join } from 'node:path';
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
};
