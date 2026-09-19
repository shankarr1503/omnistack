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
