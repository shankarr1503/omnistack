import { join } from 'node:path';
export default ({ work, dir, add, read, findIssues }) => {
  const report = read(join(work, 'REPORT.md'));
  add('report-written', report.length > 200);
  findIssues(report, JSON.parse(read(join(dir, 'expected.json'))).issues);
  add(
    'verdict-not-ship',
    /(do not ship|don't ship|not safe|not ready|do not merge|don't merge|ship after fix|block|request(ed)? changes|needs? (changes|fixes))/i.test(
      report,
    ),
    'verdict',
  );
};
