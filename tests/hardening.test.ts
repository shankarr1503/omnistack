import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/loader.js';
import { withExecutionLock } from '../src/core/lock.js';
import { recoverCheckpoint } from '../src/tools/recovery.js';
import { ToolController, contentHash } from '../src/tools/controller.js';
import { execute } from '../src/utils/process.js';
import { scanRepository } from '../src/repository/scanner.js';
import { anonymize } from '../src/council/council.js';
import { orchestrate } from '../src/core/orchestrator.js';
import { ConfigSchema } from '../src/config/schema.js';
async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omni-hardening-'));
}
test('project configuration cannot relax global privacy or provider denials', async () => {
  const home = await temp(),
    root = await temp();
  await mkdir(join(root, '.omni'));
  await writeFile(
    join(home, 'config.yaml'),
    'privacy:\n  cloudAllowed: false\n  deniedProviders: [blocked]\n  allowedProviders: [trusted]\n  paths:\n    "private/**":\n      cloudAllowed: false\n',
  );
  await writeFile(
    join(root, '.omni/config.yaml'),
    'privacy:\n  cloudAllowed: true\n  deniedProviders: []\n  paths:\n    "private/**":\n      cloudAllowed: true\n',
  );
  const config = await loadConfig({ home, root, env: {} });
  assert.equal(config.privacy.cloudAllowed, false);
  assert.ok(config.privacy.deniedProviders.includes('blocked'));
  assert.deepEqual(config.privacy.allowedProviders, ['trusted']);
  assert.equal(config.privacy.paths['private/**']?.cloudAllowed, false);
  await writeFile(join(root, '.omni/config.yaml'), 'privacy:\n  allowedProviders: [untrusted]\n');
  await assert.rejects(loadConfig({ home, root, env: {} }), /intersection/);
});
test('daily budget requires persistent local accounting', async () => {
  const home = await temp();
  await writeFile(join(home, 'config.yaml'), 'telemetry: false\nbudget:\n  dailyUsd: 10\n');
  await assert.rejects(loadConfig({ home, env: {} }), /ledger/);
});
test('execution lock rejects concurrent owners and releases after failure', async () => {
  const home = await temp();
  await assert.rejects(
    withExecutionLock(home, async () => {
      await assert.rejects(
        withExecutionLock(home, async () => 1),
        /Another/,
      );
      throw new Error('intentional');
    }),
    /intentional/,
  );
  assert.equal(await withExecutionLock(home, async () => 42), 42);
});
test('recovery restores preexisting dirty contents and refuses later user edits', async () => {
  const root = await temp();
  await execute('git', ['init'], root);
  await writeFile(join(root, 'file.txt'), 'dirty original');
  const controller = new ToolController(await scanRepository(root), await temp(), {
    write: true,
    commands: false,
    approvalMode: 'strict',
  });
  await controller.call({
    id: '1',
    name: 'write_file',
    arguments: {
      path: 'file.txt',
      content: 'agent change',
      expectedHash: contentHash('dirty original'),
    },
  });
  assert.equal((await recoverCheckpoint(controller.checkpoint)).restored, false);
  assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'agent change');
  await writeFile(join(root, 'file.txt'), 'later user change');
  await assert.rejects(recoverCheckpoint(controller.checkpoint, true), /subsequent/);
  await writeFile(join(root, 'file.txt'), 'agent change');
  await recoverCheckpoint(controller.checkpoint, true);
  assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'dirty original');
});
test('anonymization does not corrupt words containing short provider IDs', () => {
  const text = anonymize('Candidate has a stable cache. a-model proposes this.', [
    { id: 'a-model', provider: 'a', local: true, capabilities: [] },
  ]);
  assert.ok(text.includes('stable cache'));
  assert.ok(!text.includes('a-model'));
});
test('test workflow runs without models and reports actual exit status', async () => {
  const root = await temp();
  await execute('git', ['init'], root);
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }),
  );
  const passed = (await orchestrate(ConfigSchema.parse({}), {
    root,
    home: await temp(),
    workflow: 'test',
    request: 'test',
    allowCommands: true,
  })) as { status: string };
  assert.equal(passed.status, 'verified');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(7)"' } }),
  );
  const failed = (await orchestrate(ConfigSchema.parse({}), {
    root,
    home: await temp(),
    workflow: 'test',
    request: 'test',
    allowCommands: true,
  })) as { status: string };
  assert.equal(failed.status, 'needs-attention');
});
test('edit_file keeps dollar sequences in replacement text literal', async () => {
  const root = await temp(),
    home = await temp();
  await execute('git', ['init', '-q'], root);
  await writeFile(join(root, 'run.sh'), 'echo OLD\n');
  const repo = await scanRepository(root);
  const tools = new ToolController(repo, home, {
    write: true,
    commands: false,
    approvalMode: 'balanced',
  });
  await tools.call({
    id: '1',
    name: 'edit_file',
    arguments: { path: 'run.sh', oldText: 'echo OLD', newText: 'echo "$$HOME $& $1"' },
  });
  assert.equal(await readFile(join(root, 'run.sh'), 'utf8'), 'echo "$$HOME $& $1"\n');
});
test('review diff covers every changed file, not the first files in the repository', async () => {
  const root = await temp(),
    home = await temp();
  await execute('git', ['init', '-q'], root);
  for (let i = 0; i < 150; i++)
    await writeFile(join(root, `f${String(i).padStart(3, '0')}.txt`), 'x\n');
  await writeFile(join(root, 'zz-last.txt'), 'before\n');
  await execute('git', ['add', '.'], root);
  await execute(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'],
    root,
  );
  const repo = await scanRepository(root);
  const tools = new ToolController(repo, home, {
    write: true,
    commands: false,
    approvalMode: 'balanced',
  });
  await writeFile(join(root, 'zz-last.txt'), 'after\n');
  await tools.call({
    id: '1',
    name: 'write_file',
    arguments: { path: './nested/../created.ts', content: 'export {};\n', expectedHash: null },
  });
  const diff = await tools.filteredDiff();
  assert.match(diff, /zz-last\.txt/);
  assert.match(diff, /\+after/);
  assert.match(diff, /created\.ts\nexport \{\};/);
  assert.ok(repo.files.includes('created.ts'));
  assert.doesNotMatch(diff, /f000\.txt/);
});
test('common credential files are outside repository tool scope', async () => {
  const { sensitive } = await import('../src/repository/boundary.js');
  for (const path of [
    '.netrc',
    '.npmrc',
    'sub/.pypirc',
    '.docker/config.json',
    'prod.tfvars',
    '.kube/config',
  ])
    assert.ok(sensitive(path), path);
  assert.ok(!sensitive('src/netrc.ts'));
});
