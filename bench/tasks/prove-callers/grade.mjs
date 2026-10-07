import { join } from 'node:path';
import { readdirSync } from 'node:fs';
export default ({ work, dir, add, read, runTests, withHidden }) => {
  const h = withHidden(join(dir, 'hidden/hidden.test.js'), 'test/zz_hidden.test.js', (f) =>
    runTests(f),
  );
  add('hidden-tests', h.fail === 0 && h.pass > 0, `${h.pass} passed, ${h.fail} failed`);
  const i = runTests('test/integration/**/*.test.js');
  add('integration-suite-passes', i.fail === 0 && i.pass > 0, `${i.pass} passed, ${i.fail} failed`);
  const u = runTests('test/unit/**/*.test.js');
  add('unit-suite-passes', u.fail === 0 && u.pass > 0, `${u.pass} passed, ${u.fail} failed`);
  const testText = ['unit', 'integration']
    .flatMap((d) => readdirSync(join(work, 'test', d)).map((f) => read(join(work, 'test', d, f))))
    .join('\n');
  add('eur-test-added', /EUR|€/.test(testText));
};
