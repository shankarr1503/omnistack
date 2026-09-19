import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigSchema } from '../src/config/schema.js';
import { classify } from '../src/router/classifier.js';
import { ModelRouter } from '../src/router/model-router.js';
import { permitsModel, globMatches } from '../src/privacy/evaluator.js';
import { MockProvider, mockResponse } from '../src/providers/mock.js';
import { ModelRegistry } from '../src/registry/model-registry.js';
import { AgentRuntime } from '../src/agents/runtime.js';
import { Budget } from '../src/telemetry/ledger.js';
import { council, anonymize } from '../src/council/council.js';
import { ContextOverflowError, RateLimitError, AuthenticationError } from '../src/utils/errors.js';
import { validateGraph, runGraph, mapConcurrent } from '../src/core/task-graph.js';
import { authorize, safeCommand } from '../src/permissions/evaluator.js';
import { ToolController, contentHash } from '../src/tools/controller.js';
import { scanRepository } from '../src/repository/scanner.js';
import { execute } from '../src/utils/process.js';
import { orchestrate } from '../src/core/orchestrator.js';
import { WorktreeManager } from '../src/worktrees/manager.js';
import { verify } from '../src/core/verifier.js';
const proposal = (text: string) => ({
  proposal: text,
  assumptions: [],
  risks: [],
  alternatives: [],
  filesLikelyAffected: [],
  testPlan: ['unit test'],
  securityConcerns: [],
  confidenceNotes: 'Requires verification',
});
const critique = { strengths: ['Compatible'], contradictions: [], risks: [], unresolved: [] };
const synthesis = {
  recommendation: 'Combine ideas',
  combinedInsights: ['A', 'B'],
  tradeoffs: [],
  unresolvedConflicts: [],
  implementationPlan: ['Implement'],
  verification: ['Test'],
};
const review = { summary: 'No evidenced issues', findings: [] };
const plan = {
  summary: 'Add module',
  tasks: [
    {
      id: 'code',
      title: 'Implement',
      dependencies: [],
      targetFiles: ['new.ts'],
      validation: ['test'],
    },
  ],
  risks: [],
};
async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omni-runtime-'));
}
async function repo(): Promise<string> {
  const root = await temp();
  await execute('git', ['init', '-b', 'main'], root);
  return root;
}
async function register(registry: ModelRegistry, provider: MockProvider): Promise<void> {
  registry.register(provider, await provider.listModels());
}
test('classifier selects bounded modes based on task risk', () => {
  assert.equal(classify('Fix README typo').mode, 'fast');
  assert.equal(classify('Add an endpoint').mode, 'team');
  assert.equal(classify('Build multi-tenant authentication').mode, 'council');
  assert.equal(classify('authentication', 'run', 'team').mode, 'team');
});
test('routing enforces capabilities and privacy before selecting providers', () => {
  const config = ConfigSchema.parse({
    privacy: { paths: { 'src/private/**': { cloudAllowed: false } } },
  });
  const cloud = { id: 'c', provider: 'cloud', local: false, capabilities: ['coding'] },
    local = { ...cloud, id: 'l', provider: 'local', local: true };
  assert.ok(globMatches('src/private/**', 'src/private/deep/file.ts'));
  assert.ok(!permitsModel(config, cloud, ['src/private/deep/file.ts']));
  assert.equal(
    new ModelRouter(config).select([cloud, local], ['coding'], ['src/private/key.ts'])[0]?.id,
    'l',
  );
  assert.throws(
    () => new ModelRouter(config).select([cloud], ['coding'], ['src/private/key.ts']),
    /No eligible/,
  );
  assert.throws(() => new ModelRouter(config).select([local], ['vision'], []), /No eligible/);
});
test('router prefers provider diversity without inventing quality scores', () => {
  const config = ConfigSchema.parse({});
  const models = ['a', 'a', 'b'].map((provider, i) => ({
    id: String(i),
    provider,
    local: true,
    capabilities: ['coding'],
  }));
  assert.deepEqual(
    new ModelRouter(config).select(models, ['coding'], [], 2).map((m) => m.provider),
    ['a', 'b'],
  );
});
test('council survives one failed provider, anonymizes identities and synthesizes', async () => {
  const registry = new ModelRegistry(),
    a = new MockProvider('alpha', [
      mockResponse(proposal('alpha-model recommends caching')),
      mockResponse(critique),
    ]),
    b = new MockProvider('beta', [
      mockResponse(proposal('beta-model recommends invalidation')),
      mockResponse(synthesis),
    ]),
    c = new MockProvider('broken', [new AuthenticationError()]);
  await register(registry, a);
  await register(registry, b);
  await register(registry, c);
  const config = ConfigSchema.parse({ execution: { retries: 0 } }),
    runtime = new AgentRuntime(registry, config, new Budget(config));
  const result = (await council(runtime, [...registry.models.values()], 'Design caching')) as {
    independentCandidates: number;
    failures: string[];
    synthesis: unknown;
  };
  assert.equal(result.independentCandidates, 2);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.synthesis, synthesis);
  const criticPrompt = a.calls[1]?.messages[1]?.content ?? '';
  assert.ok(criticPrompt.includes('Candidate A'));
  assert.ok(!criticPrompt.includes('alpha-model'));
  assert.ok(!criticPrompt.includes('beta-model'));
  assert.equal(anonymize('Claude and GPT-4', []), '[model] and [model]');
});
test('council deduplicates identical proposals and reports degraded consensus', async () => {
  const registry = new ModelRegistry(),
    a = new MockProvider('a', [mockResponse(proposal('Same idea')), mockResponse(critique)]),
    b = new MockProvider('b', [mockResponse(proposal('Same idea')), mockResponse(synthesis)]);
  await register(registry, a);
  await register(registry, b);
  const config = ConfigSchema.parse({});
  const result = (await council(
    new AgentRuntime(registry, config, new Budget(config)),
    [...registry.models.values()],
    'Task',
  )) as { degraded: boolean };
  assert.equal(result.degraded, true);
});
test('retry, context reduction and provider fallback are bounded', async () => {
  const registry = new ModelRegistry(),
    a = new MockProvider('a', [new RateLimitError(), new AuthenticationError()]),
    b = new MockProvider('b', [new ContextOverflowError(), mockResponse('done')]);
  await register(registry, a);
  await register(registry, b);
  const config = ConfigSchema.parse({ execution: { retries: 2 } });
  const result = await new AgentRuntime(registry, config, new Budget(config)).generate(
    [...registry.models.values()],
    [{ role: 'user', content: 'x'.repeat(1000) }],
  );
  assert.equal(result.response.content, 'done');
  assert.equal(a.calls.length, 2);
  assert.ok(b.calls[1]!.messages[0]!.content.length < b.calls[0]!.messages[0]!.content.length);
});
test('runtime enforces timeout and cancellation even for uncooperative plugins', async () => {
  const registry = new ModelRegistry(),
    provider = new MockProvider('timeout', [
      async () => new Promise((resolve) => setTimeout(() => resolve(mockResponse('late')), 80)),
    ]);
  await register(registry, provider);
  const config = ConfigSchema.parse({ execution: { modelTimeout: 10, retries: 0 } });
  await assert.rejects(
    new AgentRuntime(registry, config, new Budget(config)).generate(
      [...registry.models.values()],
      [],
    ),
    /timed out/,
  );
  const signal = AbortSignal.abort(new Error('user cancelled'));
  await assert.rejects(
    new AgentRuntime(registry, config, new Budget(config)).generate(
      [...registry.models.values()],
      [],
      [],
      signal,
    ),
    /user cancelled/,
  );
});
test('hard budgets fail closed on unknown pricing and concurrent reservations', () => {
  const config = ConfigSchema.parse({ budget: { taskUsd: 0.02 } }),
    budget = new Budget(config),
    model = { id: 'x', provider: 'p', capabilities: [], local: false };
  assert.throws(() => budget.reserve(model, 100), /pricing/);
  const priced = { ...model, inputUsdPerMillion: 1, outputUsdPerMillion: 1 };
  const release = budget.reserve(priced, 1000);
  assert.throws(() => budget.reserve(priced, 1000), /exceeded/);
  release({ inputTokens: 1, outputTokens: 1, costUsd: 0.000002 });
  budget.reserve(priced, 1000);
});
test('DAG detects missing dependencies and cycles; independent tasks execute concurrently', async () => {
  const task = (id: string, dependencies: string[]) => ({
    id,
    dependencies,
    title: id,
    targetFiles: [],
    validation: [],
  });
  assert.throws(() => validateGraph([task('a', ['missing'])]), /Unknown/);
  assert.throws(() => validateGraph([task('a', ['b']), task('b', ['a'])]), /cycle/);
  const completed: string[] = [];
  await runGraph(
    [task('a', []), task('b', []), task('c', ['a', 'b'])],
    async (t) => {
      if (t.id === 'c') assert.equal(completed.length, 2);
      completed.push(t.id);
      return t.id;
    },
    2,
  );
  let active = 0,
    peak = 0;
  await mapConcurrent([1, 2, 3, 4], 2, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  assert.equal(peak, 2);
});
test('permissions reject shell injection, destructive commands and unapproved mutations', () => {
  const grants = { write: false, commands: false, approvalMode: 'autonomous-safe' as const };
  assert.throws(() => authorize('write', grants));
  assert.throws(() => authorize('destructive', { ...grants, write: true, commands: true }));
  assert.ok(safeCommand('npm', ['run', 'test']));
  for (const args of [['push'], ['reset', '--hard'], ['status', ';whoami']])
    assert.ok(!safeCommand('git', args));
  assert.ok(!safeCommand('node', ['-e', 'malicious']));
});
test('tools preserve dirty edits with preimages and reject stale writes', async () => {
  const root = await repo(),
    home = await temp();
  await writeFile(join(root, 'user.ts'), 'user edits');
  const controller = new ToolController(await scanRepository(root), home, {
    write: true,
    commands: false,
    approvalMode: 'balanced',
  });
  await controller.call({
    id: '1',
    name: 'write_file',
    arguments: {
      path: 'user.ts',
      content: 'user edits\nnew feature',
      expectedHash: contentHash('user edits'),
    },
  });
  const journal = JSON.parse(await readFile(controller.checkpoint, 'utf8')) as {
    entries: { before: string }[];
  };
  assert.equal(journal.entries[0]?.before, 'user edits');
  await assert.rejects(
    controller.call({
      id: '2',
      name: 'write_file',
      arguments: { path: 'user.ts', content: 'overwrite', expectedHash: contentHash('user edits') },
    }),
    /changed since/,
  );
  await assert.rejects(
    controller.call({
      id: '3',
      name: 'run_command',
      arguments: { command: 'npm', args: ['run', 'test'] },
    }),
    /not authorized/,
  );
  assert.equal((await verify(controller))[0]?.status, 'skipped');
});
test('tool privacy checks also apply to subsequent model reads', async () => {
  const root = await repo();
  await writeFile(join(root, 'private.ts'), 'private source');
  const controller = new ToolController(
    await scanRepository(root),
    await temp(),
    { write: true, commands: false, approvalMode: 'balanced' },
    1000,
    (path) => path !== 'private.ts',
  );
  await assert.rejects(
    controller.call({ id: '1', name: 'read_file', arguments: { path: 'private.ts' } }),
    /Privacy/,
  );
});
test('TEAM actually writes files, retains dirty tree, verifies skipped honestly and reviews independently', async () => {
  const root = await repo(),
    home = await temp();
  await writeFile(join(root, 'user.txt'), 'keep me');
  const toolResponse = mockResponse('');
  toolResponse.toolCalls = [
    {
      id: 'write',
      name: 'write_file',
      arguments: { path: 'new.ts', content: 'export const answer = 42;\n', expectedHash: null },
    },
  ];
  const registry = new ModelRegistry(),
    a = new MockProvider('a', [
      mockResponse(plan),
      toolResponse,
      mockResponse('Implemented module'),
    ]),
    b = new MockProvider('b', [mockResponse(review)]);
  await register(registry, a);
  await register(registry, b);
  const result = (await orchestrate(ConfigSchema.parse({}), {
    root,
    home,
    request: 'Add a module',
    mode: 'team',
    allowWrite: true,
    registry,
  })) as { status: string; independentReview: boolean; changedFiles: string[]; diff: string };
  assert.equal(await readFile(join(root, 'new.ts'), 'utf8'), 'export const answer = 42;\n');
  assert.equal(await readFile(join(root, 'user.txt'), 'utf8'), 'keep me');
  assert.equal(result.status, 'unverified');
  assert.equal(result.independentReview, true);
  assert.deepEqual(result.changedFiles, ['new.ts']);
  assert.ok(result.diff.includes('answer = 42'));
});
test('review works in an uninitialized foreign repository', async () => {
  const root = await repo();
  await writeFile(join(root, 'source.ts'), 'export const x = 1;');
  const registry = new ModelRegistry();
  await register(registry, new MockProvider('review', [mockResponse(review)]));
  const result = (await orchestrate(ConfigSchema.parse({}), {
    root,
    home: await temp(),
    request: 'Review',
    workflow: 'review',
    registry,
  })) as { review: unknown };
  assert.deepEqual(result.review, review);
});
test('worktrees isolate changes and refuse dirty removal', async () => {
  const root = await repo();
  await writeFile(join(root, 'README.md'), 'base');
  await execute('git', ['add', '.'], root);
  await execute(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'base'],
    root,
  );
  const manager = new WorktreeManager(root, await temp()),
    tree = await manager.create('feature');
  await writeFile(join(tree.path, 'README.md'), 'worker change');
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), 'base');
  await assert.rejects(manager.remove(tree.path), /Dirty/);
  await writeFile(join(tree.path, 'README.md'), 'base');
  await manager.remove(tree.path);
  await assert.rejects(manager.remove(root), /managed/);
});
