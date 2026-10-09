import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
const root = fileURLToPath(new URL('../', import.meta.url)),
  library = join(root, 'library', 'skills');
// Names that collide with commands built into common hosts would shadow or be shadowed.
const reserved = ['code-review', 'security-review', 'review', 'init', 'simplify', 'debug', 'test'];
test('every library skill is valid, uniquely named and self-contained', async () => {
  const names = (await readdir(library, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert.ok(names.length >= 10, 'library should ship a substantial set of skills');
  const descriptions = new Set<string>();
  for (const name of names) {
    const text = await readFile(join(library, name, 'SKILL.md'), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    assert.ok(match, `${name}: missing frontmatter`);
    const meta = parse(match[1]!) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(meta).sort(),
      ['description', 'name'],
      `${name}: frontmatter keys`,
    );
    assert.equal(meta.name, name, `${name}: name must match directory`);
    assert.match(name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, `${name}: kebab-case`);
    assert.ok(!reserved.includes(name), `${name}: collides with a host built-in`);
    const description = String(meta.description);
    assert.ok(description.length >= 80 && description.length <= 400, `${name}: description length`);
    assert.match(
      description,
      /\bUse (when|for|before)\b/,
      `${name}: description must say when to use it`,
    );
    assert.ok(!descriptions.has(description), `${name}: duplicate description`);
    descriptions.add(description);
    const body = match[2]!;
    assert.match(body, /^# /m, `${name}: needs a title`);
    assert.ok(body.split('\n').length <= 200, `${name}: keep skills under 200 lines`);
    assert.doesNotMatch(
      body,
      /\bomni (run|build|plan)\b|--allow-write/,
      `${name}: must not need the runtime`,
    );
    for (const [, target] of body.matchAll(/`([a-z0-9-]+)` skill/g))
      assert.ok(names.includes(target!), `${name}: references unknown skill ${target}`);
  }
});
test('plugin manifests point at the library', async () => {
  const marketplace = JSON.parse(
    await readFile(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'),
  ) as { plugins: { name: string; source: string; version: string }[] };
  const plugin = JSON.parse(
    await readFile(join(root, 'library', '.claude-plugin', 'plugin.json'), 'utf8'),
  ) as { name: string; version: string };
  assert.equal(marketplace.plugins[0]!.source, './library');
  assert.equal(marketplace.plugins[0]!.name, plugin.name);
  assert.equal(marketplace.plugins[0]!.version, plugin.version);
});
const company = join(library, 'company'),
  rolesDir = join(company, 'roles');
const roleTools = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'];
// Roles that decide or review must not be able to change the code they judge.
const readOnlyRoles = ['board', 'ceo', 'cfo', 'cpo', 'cso', 'cto', 'design-lead', 'eng-manager'];
async function roles() {
  const files = (await readdir(rolesDir)).filter((f) => f.endsWith('.md')).sort();
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(join(rolesDir, file), 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
      assert.ok(match, `${file}: missing frontmatter`);
      return {
        file,
        role: file.replace(/\.md$/, ''),
        meta: parse(match[1]!) as Record<string, unknown>,
        body: match[2]!,
      };
    }),
  );
}
test('company roles are valid Claude Code subagents', async () => {
  const all = await roles();
  assert.ok(all.length >= 10, 'the company needs a full org chart');
  for (const { role, meta, body } of all) {
    assert.deepEqual(
      Object.keys(meta).sort(),
      ['description', 'model', 'name', 'tools'],
      `${role}: frontmatter keys`,
    );
    // The plugin namespaces agents as omni:<name>; install.sh renames them omni-<name>.
    assert.equal(meta.name, role, `${role}: name must match file`);
    assert.match(role, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, `${role}: kebab-case`);
    assert.ok(
      ['inherit', 'opus', 'sonnet', 'haiku'].includes(String(meta.model)),
      `${role}: model`,
    );
    const tools = String(meta.tools).split(/,\s*/);
    for (const tool of tools) assert.ok(roleTools.includes(tool), `${role}: unknown tool ${tool}`);
    // Only the chief of staff (the main agent) spawns roles, so no role may spawn agents.
    assert.ok(
      !tools.includes('Agent') && !tools.includes('Task'),
      `${role}: must not spawn agents`,
    );
    if (readOnlyRoles.includes(role))
      assert.ok(!tools.includes('Edit') && !tools.includes('Write'), `${role}: must be read-only`);
    const description = String(meta.description);
    assert.ok(description.length >= 80 && description.length <= 400, `${role}: description length`);
    assert.match(
      description,
      /\bUse (when|for|before|after|at|as)\b/,
      `${role}: say when to use it`,
    );
    assert.match(body, /^# /m, `${role}: needs a title`);
    assert.match(body, /^## What you return/m, `${role}: needs a report format`);
    assert.match(body, /```[\s\S]+```/, `${role}: report format needs a template`);
    assert.ok(body.split('\n').length <= 120, `${role}: keep role briefs short`);
    for (const [, target] of body.matchAll(/`([a-z0-9-]+)` skill/g)) {
      const skill = await readFile(join(library, target!, 'SKILL.md'), 'utf8').catch(() => '');
      assert.ok(skill, `${role}: references unknown skill ${target}`);
    }
  }
});
test('the company skill, its roles and the plugin manifest agree', async () => {
  const names = (await roles()).map((r) => r.role);
  const skill = await readFile(join(company, 'SKILL.md'), 'utf8');
  const called = new Set([...skill.matchAll(/\*\*([a-z]+(?:-[a-z]+)*)\*\*/g)].map((m) => m[1]!));
  for (const name of names) {
    // Engineers are named by level inside the build phase rather than in bold.
    const mentioned = called.has(name) || skill.includes(`\`${name}\``);
    assert.ok(mentioned, `company skill never calls ${name}`);
  }
  // Bold lower-case words in the skill are role calls; each must exist.
  for (const name of called)
    assert.ok(names.includes(name), `company skill calls unknown role ${name}`);
  const plugin = JSON.parse(
    await readFile(join(root, 'library', '.claude-plugin', 'plugin.json'), 'utf8'),
  ) as { agents?: string[] };
  assert.deepEqual(
    [...(plugin.agents ?? [])].sort(),
    names.map((n) => `./skills/company/roles/${n}.md`),
    'plugin.json must list every role as an agent',
  );
});
