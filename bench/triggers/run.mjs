#!/usr/bin/env node
// Triggering eval: does the right library skill load on its own from the user's wording?
// Usage: node bench/triggers/run.mjs [--only <skill>] [--budget <usd per case>] [--out <file>] [--dry-run]
// Each case runs `claude -p` once, with the library loaded as a plugin, in an empty temporary
// repository and with no tool that can change files or run commands. It records every skill the
// agent loads (a Skill call, or a Read of a SKILL.md) and compares it with cases.json. Real runs
// cost money on your account: try --dry-run first, and --only to run a few cases.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const plugin = join(here, '..', '..', 'library');

/** Library skills the agent loaded, from `claude -p --output-format stream-json` output. */
export function skillsLoaded(stream) {
  const loaded = new Set();
  for (const line of stream.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== 'assistant' || !Array.isArray(event.message?.content)) continue;
    for (const part of event.message.content) {
      if (part?.type !== 'tool_use') continue;
      if (part.name === 'Skill' && typeof part.input?.skill === 'string')
        loaded.add(part.input.skill.replace(/^\//, '').replace(/^omni:/, ''));
      const path = part.name === 'Read' ? String(part.input?.file_path ?? '') : '';
      const read = /(?:^|[\\/])skills[\\/]([a-z0-9-]+)[\\/]SKILL\.md$/.exec(path);
      if (read) loaded.add(read[1]);
    }
  }
  return [...loaded].sort();
}

/** Whether one case passed, given the skills loaded for it. */
export function judge(testCase, loaded) {
  if (testCase.expect === null) return loaded.length === 0;
  return loaded.includes(testCase.expect);
}

function run(prompt, cwd, budget) {
  const args = [
    '-p',
    prompt,
    '--plugin-dir',
    plugin,
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-budget-usd',
    String(budget),
    '--disallowedTools',
    'Bash',
    'Edit',
    'Write',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
    'Agent',
    'Task',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', () => resolve(out));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = flag('--only'),
    out = flag('--out'),
    budget = Number(flag('--budget') ?? 0.3);
  if (!(budget > 0)) throw new Error('--budget must be a positive number of dollars');
  const { cases } = JSON.parse(await readFile(join(here, 'cases.json'), 'utf8'));
  const selected = only ? cases.filter((c) => c.expect === only) : cases;
  if (argv.includes('--dry-run')) {
    console.log(`${selected.length} cases, at most $${(selected.length * budget).toFixed(2)}.`);
    for (const c of selected) console.log(`${c.expect ?? '(none)'}\t${c.prompt}`);
    return;
  }
  const results = [];
  for (const c of selected) {
    const cwd = await mkdtemp(join(tmpdir(), 'omni-trigger-'));
    try {
      await new Promise((resolve, reject) =>
        spawn('git', ['init', '-q'], { cwd }).on('close', resolve).on('error', reject),
      );
      const loaded = skillsLoaded(await run(c.prompt, cwd, budget));
      const passed = judge(c, loaded);
      const extra = loaded.filter((s) => s !== c.expect && !(c.accept ?? []).includes(s));
      results.push({ ...c, loaded, passed, extra });
      console.log(
        `${passed ? 'pass' : 'FAIL'}  ${c.expect ?? '(none)'}  <- [${loaded.join(', ')}]  ${c.prompt}`,
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} cases passed.`);
  const noisy = results.filter((r) => r.extra.length);
  if (noisy.length) console.log(`${noisy.length} also loaded a skill the case did not expect.`);
  if (out) await writeFile(out, JSON.stringify(results, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
