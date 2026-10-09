import { join } from 'node:path';
export default ({ work, dir, add, read, runTests, withHidden, countTests, testFiles }) => {
  const h = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
    runTests(f),
  );
  add('hidden-tests', h.fail === 0 && h.pass > 0, `${h.pass} passed, ${h.fail} failed`);
  const v = runTests('test/dashboard.test.js');
  add('visible-tests', v.fail === 0 && v.pass > 0, `${v.pass} passed, ${v.fail} failed`);
  add('test-not-weakened', read(join(work, 'test/dashboard.test.js')).includes("['ana', 'bo']"));
  const count = countTests(testFiles());
  add('regression-test-added', count > 2, `${count} tests (fixture has 2)`);
};
