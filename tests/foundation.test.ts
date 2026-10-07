import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/loader.js';
import { scanRepository } from '../src/repository/scanner.js';
import { scopedPath } from '../src/repository/boundary.js';
import { execute } from '../src/utils/process.js';
import { hostAdapters, detectHost, invocationContext } from '../src/hosts/adapter.js';
import { installSkills, uninstallSkills, managedSection } from '../src/skills/compiler.js';
import { initProject, setup, doctor } from '../src/cli/lifecycle.js';
import { HttpProvider } from '../src/providers/http.js';
import { ProviderConfigSchema } from '../src/config/schema.js';
import { ModelRegistry } from '../src/registry/model-registry.js';
import { MockProvider } from '../src/providers/mock.js';
import { redact } from '../src/utils/io.js';
async function temporary(): Promise<string> {
  // The runtime canonicalizes roots; macOS /var -> /private/var and Windows 8.3 names differ.
  return realpath(await mkdtemp(join(tmpdir(), 'omni-test-')));
}
async function repository(): Promise<string> {
  const path = await temporary();
  await execute('git', ['init', '-b', 'main'], path);
  return path;
}
test('configuration precedence and trusted options', async () => {
  const home = await temporary(),
    root = await repository();
  await mkdir(join(root, '.omni'));
  await writeFile(join(home, 'config.yaml'), 'routing:\n  policy: cheap\n');
  await writeFile(join(root, '.omni', 'config.yaml'), 'routing:\n  policy: quality\n');
  assert.equal((await loadConfig({ home, root, env: {} })).routing.policy, 'quality');
  assert.equal(
    (await loadConfig({ home, root, env: { OMNI_POLICY: 'balanced' } })).routing.policy,
    'balanced',
  );
  assert.equal(
    (
      await loadConfig({
        home,
        root,
        env: { OMNI_POLICY: 'balanced' },
        flags: { routing: { policy: 'local-only' } },
      })
    ).routing.policy,
    'local-only',
  );
  assert.equal((await loadConfig({ home, env: {} })).routing.policy, 'cheap');
  await writeFile(join(root, '.omni', 'config.yaml'), 'providers: []\n');
  await assert.rejects(loadConfig({ home, root }), /trusted option/);
});
test('repository detection, dirty tree, command detection and optional init', async () => {
  const root = await repository();
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  await writeFile(join(root, 'index.ts'), 'export const value = 1;');
  await mkdir(join(root, 'nested'));
  const repo = await scanRepository(join(root, 'nested'));
  assert.equal(repo.root.toLowerCase(), root.toLowerCase());
  assert.ok(repo.status);
  assert.deepEqual(repo.languages, ['TypeScript']);
  assert.equal(repo.commands[0]?.name, 'test');
  await initProject(root);
  await writeFile(join(root, '.omni', 'PROJECT.md'), 'User memory');
  await initProject(root);
  assert.equal(await readFile(join(root, '.omni', 'PROJECT.md'), 'utf8'), 'User memory');
});
test('filesystem rejects traversal, secrets and junctions', async () => {
  const root = await repository(),
    outside = await temporary();
  await assert.rejects(scopedPath(root, '../outside'), /scope/);
  await assert.rejects(scopedPath(root, '.env'), /scope/);
  await assert.rejects(scopedPath(root, '.git/config'), /scope/);
  await symlink(outside, join(root, 'escape'), 'junction');
  await assert.rejects(scopedPath(root, 'escape/file'), /links/);
  assert.equal(await scopedPath(root, 'new/file.ts'), join(root, 'new', 'file.ts'));
});
test('host detection respects explicit context and recursion limits', () => {
  assert.equal(detectHost({ CODEX_THREAD_ID: 'a' }), 'codex');
  assert.equal(detectHost({ CLAUDECODE: '1' }), 'claude-code');
  assert.equal(detectHost({ OPENCODE_SESSION_ID: 'a' }), 'opencode');
  assert.equal(detectHost({}, undefined, '/bin/codex'), 'codex');
  assert.equal(detectHost({ CODEX_THREAD_ID: 'a' }, 'opencode'), 'opencode');
  assert.equal(detectHost({}), 'standalone');
  assert.equal(invocationContext({ OMNI_DEPTH: '1' }).depth, 2);
  assert.throws(() => invocationContext({ OMNI_DEPTH: '3' }), /recursion/);
});
for (const fixture of ['none', 'claude', 'codex', 'opencode', 'all', 'dirty', 'initialized'])
  test(`host lifecycle preserves ${fixture} fixture`, async () => {
    const home = await temporary(),
      userHome = await temporary(),
      root = await repository(),
      adapters = hostAdapters(userHome, {});
    const originals: Record<string, string> =
      fixture === 'none'
        ? {}
        : {
            ...(fixture === 'claude' || fixture === 'all'
              ? { 'CLAUDE.md': '# User Claude instructions' }
              : {}),
            ...(fixture === 'codex' || fixture === 'all'
              ? { 'AGENTS.md': '# User agent instructions' }
              : {}),
            ...(fixture === 'opencode' || fixture === 'all'
              ? { 'opencode.json': '{"theme":"dark"}' }
              : {}),
            ...(fixture === 'dirty' ? { 'user.txt': 'uncommitted changes' } : {}),
          };
    for (const [name, value] of Object.entries(originals)) await writeFile(join(root, name), value);
    if (fixture === 'initialized') await initProject(root);
    const unrelated = join(adapters[0]!.skillDirectory, 'user-skill');
    await mkdir(unrelated, { recursive: true });
    await writeFile(join(unrelated, 'SKILL.md'), 'User skill');
    await writeFile(join(home, 'config.yaml'), 'version: 1\n');
    await setup(home, adapters);
    assert.equal((await installSkills(home, adapters)).length, 36);
    await initProject(root);
    await doctor(home, root, adapters);
    const result = await uninstallSkills(home, adapters);
    assert.equal(result.removed.length, 36);
    assert.equal(await readFile(join(unrelated, 'SKILL.md'), 'utf8'), 'User skill');
    for (const [name, value] of Object.entries(originals))
      assert.equal(await readFile(join(root, name), 'utf8'), value);
  });
test('installer refuses collisions and preserves edited managed wrappers', async () => {
  const home = await temporary(),
    userHome = await temporary(),
    adapters = hostAdapters(userHome, {});
  await installSkills(home, adapters);
  const path = join(adapters[0]!.skillDirectory, 'omni', 'SKILL.md');
  await writeFile(path, 'user edits');
  await assert.rejects(installSkills(home, adapters), /overwritten/);
  const result = await uninstallSkills(home, adapters);
  assert.ok(result.preserved.includes(path));
  assert.equal(await readFile(path, 'utf8'), 'user edits');
});
test('managed sections retain surrounding user content', () => {
  const first = managedSection('User heading\n', 'old');
  const next = managedSection(first + 'User footer\n', 'new');
  assert.ok(next.startsWith('User heading\n'));
  assert.ok(next.endsWith('User footer\n'));
  assert.ok(!next.includes('old'));
  assert.throws(() => managedSection('<!-- omnistack:start -->', 'x'));
});
test('OpenAI adapter translates tool calls and validates malformed replies', async () => {
  const config = ProviderConfigSchema.parse({
    id: 'test',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:8000/v1',
    local: true,
  });
  const provider = new HttpProvider(config, 1000, {}, async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    assert.equal(body.model, 'dynamic-id');
    return Response.json({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: '1', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    });
  });
  const result = await provider.generate({
    model: 'dynamic-id',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 50,
  });
  assert.equal(result.toolCalls[0]?.arguments.path, 'a.ts');
  assert.equal(result.usage.inputTokens, 3);
  const bad = new HttpProvider(config, 1000, {}, async () => Response.json({}));
  await assert.rejects(bad.generate({ model: 'x', messages: [], maxTokens: 50 }), /schema/);
});
test('Anthropic adapter excludes thinking and translates tools', async () => {
  const config = ProviderConfigSchema.parse({
    id: 'anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  });
  const provider = new HttpProvider(
    config,
    1000,
    { ANTHROPIC_API_KEY: 'test-only' },
    async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>)['x-api-key'], 'test-only');
      return Response.json({
        content: [
          { type: 'thinking', thinking: 'private' },
          { type: 'text', text: 'safe summary' },
        ],
        usage: { input_tokens: 5, output_tokens: 6 },
        stop_reason: 'end_turn',
      });
    },
  );
  assert.equal(
    (await provider.generate({ model: 'dynamic', messages: [], maxTokens: 50 })).content,
    'safe summary',
  );
});
test('provider HTTP failures are typed without leaking server text', async () => {
  const config = ProviderConfigSchema.parse({
    id: 'test',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:8000',
    local: true,
  });
  for (const [status, code] of [
    [401, 'AUTHENTICATION'],
    [429, 'RATE_LIMIT'],
    [404, 'MODEL_UNAVAILABLE'],
    [500, 'PROVIDER'],
  ] as const) {
    const p = new HttpProvider(
      config,
      100,
      {},
      async () => new Response('secret-server-body', { status }),
    );
    await assert.rejects(
      p.generate({ model: 'x', messages: [], maxTokens: 1 }),
      (e: unknown) =>
        e instanceof Error &&
        'code' in e &&
        e.code === code &&
        !e.message.includes('secret-server-body'),
    );
  }
});
test('registry discovery caches and credentials never enter metadata', async () => {
  const registry = new ModelRegistry(),
    provider = new MockProvider();
  registry.register(provider);
  const home = await temporary();
  const result = await registry.discover(home);
  assert.equal(result.models.length, 1);
  assert.equal((await registry.discover(home)).warnings.length, 0);
  assert.throws(() => registry.register(provider), /Duplicate/);
  assert.ok(!redact('api_key=abcdef123456').includes('abcdef123456'));
});
