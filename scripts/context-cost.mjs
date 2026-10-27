#!/usr/bin/env node
// Usage: node scripts/context-cost.mjs [repo root] [--json]
// Estimates how many tokens the skill library puts into an agent's context (about 4 characters
// per token; the real count varies by model, so compare runs of this script, not absolutes).
//   always: what Claude Code loads into every session: each skill's name and description (skills
//           with disable-model-invocation are not listed) and each company role's name and
//           description (offered as subagents).
//   skills: the body loaded when a skill is used.   roles: a subagent's system prompt.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tokens = (text) => Math.ceil(text.length / 4);

function split(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('missing frontmatter');
  const field = (name) => new RegExp(`^${name}: (.*)$`, 'm').exec(match[1])?.[1] ?? '';
  return {
    name: field('name'),
    description: field('description'),
    manual: field('disable-model-invocation') === 'true',
    body: match[2],
  };
}

export async function contextCost(root) {
  const library = join(root, 'library', 'skills');
  const result = { always: 0, skills: {}, roles: {}, playbook: 0 };
  for (const entry of await readdir(library, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = split(await readFile(join(library, entry.name, 'SKILL.md'), 'utf8'));
    if (!skill.manual) result.always += tokens(`${skill.name}: ${skill.description}`);
    result.skills[entry.name] = tokens(skill.body);
  }
  const rolesDir = join(library, 'company', 'roles');
  for (const file of (await readdir(rolesDir)).filter((f) => f.endsWith('.md')).sort()) {
    const role = split(await readFile(join(rolesDir, file), 'utf8'));
    result.always += tokens(`${role.name}: ${role.description}`);
    result.roles[role.name] = tokens(role.body);
  }
  result.playbook = tokens(await readFile(join(library, 'company', 'playbook.md'), 'utf8'));
  return result;
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const root =
    args.find((a) => !a.startsWith('--')) ?? fileURLToPath(new URL('..', import.meta.url));
  const cost = await contextCost(root);
  if (args.includes('--json')) console.log(JSON.stringify(cost, null, 2));
  else {
    console.log(`Every session (descriptions): ~${cost.always} tokens`);
    console.log(`Skill bodies: ~${sum(cost.skills)} tokens in total, loaded one at a time`);
    for (const [name, n] of Object.entries(cost.skills)) console.log(`  ${name}: ~${n}`);
    console.log(`Role briefs: ~${sum(cost.roles)} tokens in total, one per subagent call`);
    for (const [name, n] of Object.entries(cost.roles)) console.log(`  ${name}: ~${n}`);
    console.log(`Company playbook: ~${cost.playbook} tokens`);
  }
}
