#!/usr/bin/env node
// Usage: node bench/report.mjs <runs-dir>
// Grades every <task>-<base|skill>-<n> directory and prints a Markdown summary.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const runs = resolve(process.argv[2] ?? 'runs');
const results = {};
for (const name of readdirSync(runs).sort()) {
  const m = /^(.+)-(base|skill)-(\d+)$/.exec(name);
  if (!m) continue;
  const [, task, condition] = m;
  const out = execFileSync(
    process.execPath,
    [join(import.meta.dirname, 'grade.mjs'), task, join(runs, name)],
    { encoding: 'utf8' },
  );
  const r = JSON.parse(out);
  (results[task] ??= { base: [], skill: [] })[condition].push({ name, ...r });
}
const pct = (xs) => {
  const s = xs.reduce((a, r) => a + r.score, 0),
    m = xs.reduce((a, r) => a + r.max, 0);
  return m ? Math.round((100 * s) / m) : 0;
};
const lines = [
  '| Task | Without skill | With skill | Runs | Checks missed without skill | Checks missed with skill |',
  '|---|---|---|---|---|---|',
];
let all = { base: [], skill: [] };
for (const [task, r] of Object.entries(results)) {
  const missed = (xs) =>
    [...new Set(xs.flatMap((x) => x.checks.filter((c) => !c.pass).map((c) => c.id)))].join(', ') ||
    'none';
  lines.push(
    `| ${task} | ${pct(r.base)}% | ${pct(r.skill)}% | ${r.base.length}+${r.skill.length} | ${missed(r.base)} | ${missed(r.skill)} |`,
  );
  all.base.push(...r.base);
  all.skill.push(...r.skill);
}
lines.push(
  `| **All** | **${pct(all.base)}%** | **${pct(all.skill)}%** | ${all.base.length}+${all.skill.length} | | |`,
);
console.log(lines.join('\n'));
console.log('\n<details><summary>Per-run scores</summary>\n');
for (const r of Object.values(results).flatMap((x) => [...x.base, ...x.skill]))
  console.log(
    `- ${r.name}: ${r.score}/${r.max} (failed: ${
      r.checks
        .filter((c) => !c.pass)
        .map((c) => c.id)
        .join(', ') || 'none'
    })`,
  );
console.log('\n</details>');
