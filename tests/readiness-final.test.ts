import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigSchema } from '../src/config/schema.js';
import { MockProvider } from '../src/providers/mock.js';
import { ModelRegistry } from '../src/registry/model-registry.js';
import { orchestrate } from '../src/core/orchestrator.js';
import { execute } from '../src/utils/process.js';

const entry = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
const loader = import.meta.resolve('tsx');
const temp = () => mkdtemp(join(tmpdir(), 'omni-final-'));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test(
  'cancelling during a verification check reports the cancellation and stops the whole process tree',
  { skip: process.platform === 'win32' && 'process groups and signals are POSIX' },
  async () => {
    const root = await temp();
    await execute('git', ['init', '-b', 'main'], root);
    // npm starts node, which records its pid and then hangs: the grandchild of omni.
    await writeFile(
      join(root, 'hang.js'),
      "require('fs').writeFileSync('pid', String(process.pid)); setTimeout(() => {}, 60000);\n",
    );
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', private: true, scripts: { test: 'node hang.js' } }),
    );
    const provider = new MockProvider('reviewer', []);
    const registry = new ModelRegistry();
    registry.register(provider, await provider.listModels());
    const cancellation = new AbortController();
    const run = orchestrate(ConfigSchema.parse({}), {
      root,
      home: await temp(),
      request: 'Run the tests',
      workflow: 'test',
      allowCommands: true,
      signal: cancellation.signal,
      registry,
    });
    let pid = 0;
    for (let i = 0; i < 200 && !pid; i++) {
      await new Promise((r) => setTimeout(r, 50));
      pid = Number(await readFile(join(root, 'pid'), 'utf8').catch(() => '0'));
    }
    assert.ok(pid > 0, 'the test script started');
    cancellation.abort(new Error('Cancelled by user'));
    // Before: the run resolved with { status: 'needs-attention', verification: [failed] }.
    await assert.rejects(run, /Cancelled by user/);
    for (let i = 0; i < 40 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(alive(pid), false, 'the grandchild test process was stopped');
  },
);

test('a review request that mentions a file path is request text, not a repository path', async () => {
  const root = await temp();
  await execute('git', ['init', '-b', 'main'], root);
  const result = await execute(
    process.execPath,
    ['--import', loader, entry, 'review', 'focus on src/auth.ts error handling'],
    root,
    { env: { ...process.env, OMNI_HOME: await temp(), OMNI_DEPTH: '0' }, timeout: 60_000 },
  );
  // With no providers configured the run fails later, at routing; it must not fail as a missing path.
  assert.doesNotMatch(result.stdout + result.stderr, /Repository path not found/);
  const missing = await execute(
    process.execPath,
    ['--import', loader, entry, 'review', '../no-such-repo'],
    root,
    { env: { ...process.env, OMNI_HOME: await temp(), OMNI_DEPTH: '0' }, timeout: 60_000 },
  );
  assert.match(missing.stdout + missing.stderr, /Repository path not found/);
});
