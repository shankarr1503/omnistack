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
      Object.keys(meta)
        .filter((k) => k !== 'disable-model-invocation')
        .sort(),
      ['description', 'name'],
      `${name}: frontmatter keys`,
    );
    // Only skills that cost far more than a single agent are kept from starting on their own.
    if ('disable-model-invocation' in meta)
      assert.equal(meta['disable-model-invocation'], true, `${name}: disable-model-invocation`);
    assert.equal(
      meta['disable-model-invocation'] === true,
      name === 'company',
      `${name}: only company runs on explicit invocation alone`,
    );
    assert.equal(meta.name, name, `${name}: name must match directory`);
    assert.match(name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, `${name}: kebab-case`);
    assert.ok(!reserved.includes(name), `${name}: collides with a host built-in`);
    const description = String(meta.description);
    assert.ok(description.length >= 80 && description.length <= 300, `${name}: description length`);
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
const roleTools = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'Skill'];
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
    // Plugin agents are offered in every session; scope them so they are not picked for other work.
    assert.match(description, /^Only for company-skill runs\b/, `${role}: scope to company runs`);
    // Claude Code lists every plugin agent in every session, so each extra character costs every user.
    assert.ok(description.length >= 80 && description.length <= 160, `${role}: description length`);
    assert.match(
      description,
      /\bUse (when|for|before|after|at|as)\b/,
      `${role}: say when to use it`,
    );
    assert.match(body, /^# /m, `${role}: needs a title`);
    assert.match(body, /^## What you return/m, `${role}: needs a report format`);
    assert.match(body, /```[\s\S]+```/, `${role}: report format needs a template`);
    assert.ok(body.split('\n').length <= 120, `${role}: keep role briefs short`);
    // Subagents do not inherit the parent's skills; a role that cites one must be able to load it.
    if (/`[a-z0-9-]+` skill/.test(body))
      assert.ok(tools.includes('Skill'), `${role}: cites a skill but cannot load skills`);
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
test('runtime skills trigger only for the runtime and defer to library skills', async () => {
  const runtime = join(root, 'skills');
  const library_ = (await readdir(library, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const names = (await readdir(runtime, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const descriptions = new Set<string>();
  for (const name of names) {
    const text = await readFile(join(runtime, name, 'SKILL.md'), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    assert.ok(match, `${name}: missing frontmatter`);
    const meta = parse(match[1]!) as Record<string, unknown>;
    assert.equal(meta.name, name, `${name}: name must match directory`);
    const description = String(meta.description);
    assert.ok(description.length >= 80 && description.length <= 300, `${name}: description length`);
    assert.match(description, /\bUse when\b/, `${name}: description must say when to use it`);
    // Library skills cover the same work without a runtime; these must not compete for ordinary requests.
    assert.match(description, /\bOmniStack\b/, `${name}: scope the trigger to the runtime`);
    assert.ok(!descriptions.has(description), `${name}: duplicate description`);
    descriptions.add(description);
    for (const [, target] of match[2]!.matchAll(/`([a-z0-9-]+)` skill/g))
      assert.ok(library_.includes(target!), `${name}: references unknown library skill ${target}`);
  }
});
test('the triggering eval covers every skill that loads on its own', async () => {
  const names = (await readdir(library, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const automatic: string[] = [];
  for (const name of names) {
    const text = await readFile(join(library, name, 'SKILL.md'), 'utf8');
    if (!/^disable-model-invocation: true$/m.test(text)) automatic.push(name);
  }
  const { cases } = JSON.parse(
    await readFile(join(root, 'bench', 'triggers', 'cases.json'), 'utf8'),
  ) as { cases: { prompt: string; expect: string | null; accept?: string[] }[] };
  const prompts = new Set<string>();
  for (const c of cases) {
    assert.ok(c.prompt.trim(), 'empty prompt');
    assert.ok(!prompts.has(c.prompt), `duplicate prompt: ${c.prompt}`);
    prompts.add(c.prompt);
    // A skill that only starts from its command can never be the right automatic load.
    if (c.expect !== null)
      assert.ok(automatic.includes(c.expect), `unknown or manual skill ${c.expect}`);
    for (const a of c.accept ?? []) assert.ok(automatic.includes(a), `unknown accepted skill ${a}`);
  }
  for (const name of automatic)
    assert.ok(
      cases.filter((c) => c.expect === name).length >= 3,
      `${name}: needs at least 3 triggering prompts`,
    );
  assert.ok(cases.filter((c) => c.expect === null).length >= 5, 'needs near-miss prompts');
});
test('the triggering eval reads loaded skills from the stream', async () => {
  const runner = join(root, 'bench', 'triggers', 'run.mjs');
  const { skillsLoaded, judge } = (await import(runner)) as {
    skillsLoaded: (stream: string) => string[];
    judge: (c: { expect: string | null }, loaded: string[]) => boolean;
  };
  const event = (content: unknown[]) => JSON.stringify({ type: 'assistant', message: { content } });
  const stream = [
    'not json',
    JSON.stringify({ type: 'user', message: { content: [] } }),
    event([{ type: 'tool_use', name: 'Skill', input: { skill: 'omni:root-cause' } }]),
    event([{ type: 'tool_use', name: 'Read', input: { file_path: '/x/skills/fix-ci/SKILL.md' } }]),
    event([{ type: 'tool_use', name: 'Read', input: { file_path: '/x/src/skills/notes.md' } }]),
    event([{ type: 'text', text: 'use the prove-it skill' }]),
  ].join('\n');
  assert.deepEqual(skillsLoaded(stream), ['fix-ci', 'root-cause']);
  assert.equal(judge({ expect: 'fix-ci' }, ['fix-ci', 'root-cause']), true);
  assert.equal(judge({ expect: null }, ['root-cause']), false);
  assert.equal(judge({ expect: null }, []), true);
});
// Everything an agent reads from a skill must be visible to the person reviewing it.
async function markdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // install.sh copies these trees; a symlink could pull in files from outside the repository.
    assert.ok(!entry.isSymbolicLink(), `${path}: no symlinks in skill directories`);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}
test('skills hide nothing and never fetch or run remote code', async () => {
  const files = [...(await markdownFiles(library)), ...(await markdownFiles(join(root, 'skills')))];
  assert.ok(files.length > 40, 'expected every skill, role and the playbook');
  // Zero-width, bidirectional-override and Unicode tag characters can smuggle text past a reviewer.
  const hidden =
    /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/u;
  const risky =
    /--force\b(?!-with-lease)|--no-verify|\brm -rf\b|reset --hard|git clean -[a-z]*f|\bDROP (TABLE|COLUMN|DATABASE)\b/;
  const forbidding = /\b(never|not|no|don't|without|only|unless|refuse|reject)\b/i;
  for (const file of files) {
    const name = file.slice(root.length);
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, hidden, `${name}: invisible or bidirectional characters`);
    assert.doesNotMatch(text, /<!--/, `${name}: HTML comments are hidden when rendered`);
    assert.doesNotMatch(
      text,
      /https?:\/\//,
      `${name}: skills must not send agents to remote content`,
    );
    assert.doesNotMatch(
      text,
      /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
      `${name}: never pipe a download into a shell`,
    );
    for (const line of text.split('\n'))
      if (risky.test(line))
        assert.match(
          line,
          forbidding,
          `${name}: destructive command outside a prohibition: ${line}`,
        );
  }
});
test('every skill and role treats what it reads as data', async () => {
  const names = (await readdir(library, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const name of names)
    assert.match(
      await readFile(join(library, name, 'SKILL.md'), 'utf8'),
      /^\*\*Untrusted input:\*\* /m,
      `${name}: say which inputs are data, not instructions`,
    );
  for (const { role, body, meta } of await roles()) {
    assert.match(body, /\*\*Untrusted input:\*\* /, `${role}: say which inputs are data`);
    // Bash can write files, so a read-only role gets it only to run checks, and its brief forbids edits.
    const tools = String(meta.tools).split(/,\s*/);
    if (readOnlyRoles.includes(role) && tools.includes('Bash')) {
      assert.ok(['cso', 'cto'].includes(role), `${role}: read-only roles do not need Bash`);
      assert.match(body, /do not edit/i, `${role}: a read-only role with Bash must forbid edits`);
    }
  }
});
