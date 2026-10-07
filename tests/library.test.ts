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
