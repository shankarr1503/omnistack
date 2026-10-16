import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigSchema, ProviderConfigSchema } from '../src/config/schema.js';
import { MockProvider, mockResponse } from '../src/providers/mock.js';
import * as http from '../src/providers/http.js';
import type { ModelProvider, ProviderHealth } from '../src/providers/types.js';
import { ModelRegistry } from '../src/registry/model-registry.js';
import { orchestrate } from '../src/core/orchestrator.js';
import { contentHash } from '../src/tools/controller.js';
import { execute } from '../src/utils/process.js';

const entry = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
const loader = import.meta.resolve('tsx');
const clean = { summary: 'No evidenced issues', findings: [] };
const highFinding = {
  summary: 'One blocking issue',
  findings: [
    {
      severity: 'high',
      category: 'correctness',
      file: 'add.js',
      evidence: 'add() subtracts its arguments',
      recommendation: 'Return a + b',
    },
  ],
};

async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omni-readiness-'));
}
/** A Git repository whose `npm test` script is the given shell snippet. */
async function repo(testScript?: string): Promise<string> {
  const root = await temp();
  await execute('git', ['init', '-b', 'main'], root);
  await writeFile(join(root, 'add.js'), 'export const add = (a, b) => a - b;\n');
  if (testScript !== undefined)
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', private: true, scripts: { test: testScript } }),
    );
  return root;
}
async function mockRegistry(provider: MockProvider): Promise<ModelRegistry> {
  const registry = new ModelRegistry();
  registry.register(provider, await provider.listModels());
  return registry;
}
/** Fails the test quickly instead of waiting for a runtime timeout that the bug ignores. */
async function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** A transport for an endpoint that accepts the request and never answers. */
const unresponsive: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
const slowProvider = ProviderConfigSchema.parse({
  id: 'slow',
  type: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:9/v1',
  local: true,
  models: [{ id: 'slow-model', capabilities: ['coding'] }],
});

interface Fixture {
  home: string;
  requests: string[];
  close(): Promise<void>;
}
/** A local OpenAI-compatible provider configured in a fresh OMNI_HOME. */
async function fixtureProvider(
  handle: (request: IncomingMessage, response: ServerResponse, body: string) => void,
): Promise<Fixture> {
  const home = await temp(),
    requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => handle(request, response, body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await writeFile(
    join(home, 'config.yaml'),
    'providers:\n  - id: fixture\n    type: openai-compatible\n    local: true\n    baseUrl: http://127.0.0.1:' +
      address.port +
      '/v1\n    models:\n      - id: fixture-model\n        capabilities: [coding]\n',
  );
  return {
    home,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
function answer(content: unknown) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/v1/models'
          ? { data: [{ id: 'fixture-model' }] }
          : {
              choices: [
                {
                  message: {
                    content: typeof content === 'string' ? content : JSON.stringify(content),
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            },
      ),
    );
  };
}
async function cli(args: string[], cwd: string, home: string) {
  return execute(process.execPath, ['--import', loader, entry, ...args], cwd, {
    env: { ...process.env, OMNI_HOME: home, OMNI_DEPTH: '0' },
    timeout: 60_000,
  });
}

// F9: `omni ship` must report a status so failed verification blocks the release gate.
test('ship reports needs-attention when the repository test script fails', async () => {
  const root = await repo('exit 1');
  const result = (await orchestrate(ConfigSchema.parse({}), {
    root,
    home: await temp(),
    request: 'Prepare release',
    workflow: 'ship',
    allowCommands: true,
    registry: await mockRegistry(new MockProvider('reviewer', [mockResponse(clean)])),
  })) as { status?: string; verification: { name: string; status: string }[] };
  assert.equal(result.verification[0]?.status, 'failed');
  assert.equal(result.status, 'needs-attention');
});
test('ship status follows verification and blocking review findings', async () => {
  const cases = [
    { script: 'exit 0', commands: true, review: clean, status: 'verified' },
    { script: 'exit 0', commands: true, review: highFinding, status: 'needs-attention' },
    { script: 'exit 0', commands: false, review: clean, status: 'unverified' },
  ];
  for (const c of cases) {
    const result = (await orchestrate(ConfigSchema.parse({}), {
      root: await repo(c.script),
      home: await temp(),
      request: 'Prepare release',
      workflow: 'ship',
      allowCommands: c.commands,
      registry: await mockRegistry(new MockProvider('reviewer', [mockResponse(c.review)])),
    })) as { status?: string };
    assert.equal(result.status, c.status, JSON.stringify(c));
  }
});
test('CLI ship exits 2 with needs-attention when verification fails', async () => {
  const root = await repo('exit 1'),
    provider = await fixtureProvider(answer(clean));
  try {
    const result = await cli(['ship', '--allow-commands', '--repo', root], root, provider.home);
    const output = JSON.parse(result.stdout) as {
      status?: string;
      verification: { status: string }[];
    };
    assert.equal(output.verification[0]?.status, 'failed');
    assert.equal(output.status, 'needs-attention');
    assert.equal(result.code, 2, result.stderr);
  } finally {
    await provider.close();
  }
});

// F14: run, debug and optimize must diagnose read-only instead of failing without --allow-write.
test('debug, optimize and run investigate read-only with tools when write is not granted', async () => {
  for (const workflow of ['debug', 'optimize', 'run']) {
    const root = await repo(),
      original = await readFile(join(root, 'add.js'), 'utf8');
    const read = mockResponse(''),
      write = mockResponse('');
    read.toolCalls = [{ id: 'r', name: 'read_file', arguments: { path: 'add.js' } }];
    write.toolCalls = [
      {
        id: 'w',
        name: 'write_file',
        arguments: { path: 'add.js', content: 'patched', expectedHash: contentHash(original) },
      },
    ];
    const provider = new MockProvider('investigator', [
      read,
      write,
      mockResponse('add() subtracts; proposed patch: return a + b'),
    ]);
    const result = (await orchestrate(ConfigSchema.parse({}), {
      root,
      home: await temp(),
      request: 'why does add() return the wrong value?',
      workflow,
      registry: await mockRegistry(provider),
    })) as { status: string; diagnosis: string };
    assert.equal(result.status, 'diagnosis-only', workflow);
    assert.match(result.diagnosis, /proposed patch/);
    const offered = (provider.calls[0]?.tools ?? []).map((t) => t.name);
    assert.ok(offered.includes('read_file'), workflow);
    for (const name of ['write_file', 'edit_file', 'run_command'])
      assert.ok(!offered.includes(name), `${workflow} offered ${name}`);
    assert.match(provider.calls[1]?.messages.at(-1)?.content ?? '', /a - b/);
    assert.match(provider.calls[2]?.messages.at(-1)?.content ?? '', /not authorized/);
    assert.equal(await readFile(join(root, 'add.js'), 'utf8'), original);
  }
});
test('read-only diagnosis works with a model that has no tool calling', async () => {
  const provider = new MockProvider('plain', [mockResponse('Likely cause: subtraction in add()')]);
  const registry = new ModelRegistry();
  registry.register(provider, [
    { id: 'plain-model', provider: 'plain', local: true, capabilities: ['coding'] },
  ]);
  const result = (await orchestrate(ConfigSchema.parse({}), {
    root: await repo(),
    home: await temp(),
    request: 'why does add() return the wrong value?',
    workflow: 'debug',
    registry,
  })) as { status: string; diagnosis: string };
  assert.equal(result.status, 'diagnosis-only');
  assert.match(result.diagnosis, /subtraction/);
  assert.deepEqual(provider.calls[0]?.tools, []);
});
test('build still requires --allow-write', async () => {
  const provider = new MockProvider('builder', []);
  await assert.rejects(
    orchestrate(ConfigSchema.parse({}), {
      root: await repo(),
      home: await temp(),
      request: 'Implement a pagination helper',
      workflow: 'build',
      registry: await mockRegistry(provider),
    }),
    /requires --allow-write/,
  );
  assert.equal(provider.calls.length, 0);
});
test('host skill wrappers for omni, omni-debug and omni-optimize succeed without --allow-write', async () => {
  const root = await repo(),
    provider = await fixtureProvider(answer('add() subtracts; proposed patch: return a + b'));
  try {
    for (const skill of ['omni', 'omni-debug', 'omni-optimize']) {
      const result = await cli(
        [
          'skill',
          'run',
          skill,
          '--host',
          'claude-code',
          '--repo',
          root,
          '--',
          'why does add() return the wrong value?',
        ],
        root,
        provider.home,
      );
      assert.equal(result.code, 0, `${skill}: ${result.stderr}`);
      const output = JSON.parse(result.stdout) as { status: string; diagnosis: string };
      assert.equal(output.status, 'diagnosis-only', skill);
      assert.match(output.diagnosis, /proposed patch/);
    }
    assert.equal(
      await readFile(join(root, 'add.js'), 'utf8'),
      'export const add = (a, b) => a - b;\n',
    );
  } finally {
    await provider.close();
  }
});

// F17: cancellation must reach the provider health check, which needs its own short timeout.
test('HTTP health check rejects with the cancellation reason when cancelled', async () => {
  const provider = new http.HttpProvider(slowProvider, 60_000, {}, unresponsive),
    cancellation = new AbortController();
  setTimeout(() => cancellation.abort(new Error('Cancelled by user')), 20);
  await assert.rejects(
    within(provider.healthCheck(cancellation.signal), 2000, 'healthCheck'),
    /Cancelled by user/,
  );
});
test('HTTP health check uses a short timeout separate from the model timeout', async () => {
  assert.equal(typeof http.HEALTH_CHECK_TIMEOUT_MS, 'number');
  assert.ok(http.HEALTH_CHECK_TIMEOUT_MS <= 10_000);
  assert.ok(http.HEALTH_CHECK_TIMEOUT_MS < ConfigSchema.parse({}).execution.modelTimeout);
  const provider = new http.HttpProvider(slowProvider, 60_000, {}, unresponsive);
  const health = await within(provider.healthCheck(undefined, 50), 2000, 'healthCheck');
  assert.equal(health.healthy, false);
  assert.match(health.message, /timed out/);
});
test('registry health stops waiting for a provider that ignores cancellation', async () => {
  const stuck: ModelProvider = {
    id: 'stuck',
    local: true,
    listModels: async () => [],
    generate: async () => {
      throw new Error('not used');
    },
    healthCheck: () => new Promise<ProviderHealth>(() => undefined),
  };
  const registry = new ModelRegistry(),
    cancellation = new AbortController();
  registry.register(stuck);
  setTimeout(() => cancellation.abort(new Error('Cancelled by user')), 20);
  await assert.rejects(
    within(registry.health(cancellation.signal), 2000, 'registry.health'),
    /Cancelled by user/,
  );
});
test('orchestrate rethrows cancellation during the health check instead of routing', async () => {
  const registry = new ModelRegistry();
  registry.register(new http.HttpProvider(slowProvider, 60_000, {}, unresponsive), [
    { id: 'slow-model', provider: 'slow', local: true, capabilities: ['coding'] },
  ]);
  const cancellation = new AbortController();
  setTimeout(() => cancellation.abort(new Error('Cancelled by user')), 50);
  await assert.rejects(
    within(
      orchestrate(ConfigSchema.parse({}), {
        root: await repo(),
        home: await temp(),
        request: 'Review',
        workflow: 'review',
        signal: cancellation.signal,
        registry,
      }),
      3000,
      'orchestrate',
    ),
    (error: Error) => {
      assert.match(error.message, /Cancelled by user/);
      assert.doesNotMatch(error.message, /No eligible models/);
      return true;
    },
  );
});
test('CLI Ctrl-C during an unresponsive health check exits promptly as cancelled', async () => {
  const root = await repo();
  let healthRequested: () => void = () => undefined;
  const requested = new Promise<void>((resolve) => {
    healthRequested = resolve;
  });
  // The catalog endpoint accepts the connection and never answers.
  const provider = await fixtureProvider((request) => {
    if (request.url === '/v1/models') healthRequested();
  });
  try {
    const child = spawn(process.execPath, ['--import', loader, entry, 'review', '--repo', root], {
      cwd: root,
      env: { ...process.env, OMNI_HOME: provider.home, OMNI_DEPTH: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    const exited = new Promise<number | null>((resolve) => child.once('close', resolve));
    try {
      await within(requested, 30_000, 'health check request');
      const interrupted = Date.now();
      child.kill('SIGINT');
      const code = await within(exited, 5000, 'CLI after SIGINT');
      assert.ok(Date.now() - interrupted < 5000);
      assert.equal(code, 1);
      assert.match(stderr, /Cancelled by user/);
      assert.doesNotMatch(stderr, /No eligible models/);
    } finally {
      child.kill('SIGKILL');
    }
  } finally {
    await provider.close();
  }
});
