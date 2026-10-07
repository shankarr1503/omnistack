import { join } from 'node:path';
import { cpSync, rmSync } from 'node:fs';
export default ({
  work,
  dir,
  add,
  read,
  runTests,
  withHidden,
  originalFile,
  countTests,
  testFiles,
}) => {
  cpSync(join(dir, 'hidden/original.js'), join(work, 'test/zz_original.js'));
  try {
    const h = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
      runTests(f),
    );
    add('behavior-identical', h.fail === 0 && h.pass > 0, `${h.pass} passed, ${h.fail} failed`);
  } finally {
    rmSync(join(work, 'test/zz_original.js'), { force: true });
  }
  const now = read(join(work, 'src/pricing.js'));
  add(
    'actually-refactored',
    now !== originalFile('src/pricing.js') && !/\bvar\s/.test(now),
    'changed, no var',
  );
  const v = runTests('test/pricing.test.js');
  add('visible-tests', v.fail === 0 && v.pass > 0, `${v.pass} passed, ${v.fail} failed`);
  const count = countTests(testFiles());
  add('characterization-tests-added', count >= 5, `${count} tests (fixture has 1)`);
};
