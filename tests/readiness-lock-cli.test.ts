import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { access, mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withExecutionLock } from '../src/core/lock.js';
import { execute } from '../src/utils/process.js';
const entry = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
const lockModule = pathToFileURL(fileURLToPath(new URL('../src/core/lock.ts', import.meta.url)));
const loader = import.meta.resolve('tsx');
async function temp(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omni-readiness-' + prefix + '-'));
}
function lockPath(home: string): string {
  return join(home, 'state', 'execution.lock');
}
async function writeLock(home: string, owner: Record<string, unknown>): Promise<void> {
  await mkdir(join(home, 'state'), { recursive: true });
  await writeFile(lockPath(home), JSON.stringify(owner));
}
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
/** A PID that belonged to a process which has exited and been reaped. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const pid = child.pid;
  assert.ok(pid);
  await once(child, 'exit');
  return pid;
}
interface FakeProvider {
  server: Server;
  port: number;
  completions: string[];
  catalogRequests: number;
  completionStarted: Promise<void>;
}
/** OpenAI-compatible fixture: answers with an empty review, or never answers when `hang` is set. */
async function fakeProvider(hang: boolean): Promise<FakeProvider> {
  let started!: () => void;
  const state = {
    completions: [] as string[],
    catalogRequests: 0,
    completionStarted: new Promise<void>((resolve) => (started = resolve)),
  };
  const server = createServer((request, response) => {
    if (request.url === '/v1/models') {
      state.catalogRequests++;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      state.completions.push(body);
      started();
      if (hang) return;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ summary: 'Reviewed fixture', findings: [] }) },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    server,
    port: address.port,
    get completions() {
      return state.completions;
    },
    get catalogRequests() {
      return state.catalogRequests;
    },
    completionStarted: state.completionStarted,
  };
}
async function closeProvider(provider: FakeProvider): Promise<void> {
  provider.server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    provider.server.close((error) => (error ? reject(error) : resolve())),
  );
}
async function omniHomeFor(provider: FakeProvider): Promise<string> {
  const home = await temp('home');
  await writeFile(
    join(home, 'config.yaml'),
    'providers:\n  - id: fixture\n    type: openai-compatible\n    local: true\n    baseUrl: http://127.0.0.1:' +
      provider.port +
      '/v1\n    models:\n      - id: fixture-model\n        capabilities: [coding]\n',
  );
  return home;
}
async function gitRepository(): Promise<string> {
  const root = await temp('repo');
  await execute('git', ['init'], root);
  await writeFile(join(root, 'index.ts'), 'export const secretFixture = 1;');
  return root;
}
function cliEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, OMNI_HOME: home, OMNI_DEPTH: '0' };
}

// F10: a lock left by a process that is gone must not block every later command.
test('execution lock reclaims a lock whose recorded process no longer exists', async () => {
  const home = await temp('stale');
  await writeLock(home, { pid: await deadPid(), started: '2026-01-01T00:00:00.000Z' });
  assert.equal(await withExecutionLock(home, async () => 'reclaimed'), 'reclaimed');
  assert.equal(await exists(lockPath(home)), false);
  // A previous process that happened to have this PID is not this process's own lock.
  await writeLock(home, {
    pid: process.pid,
    host: hostname(),
    started: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(await withExecutionLock(home, async () => 'reused pid'), 'reused pid');
  assert.equal(await exists(lockPath(home)), false);
});

test('execution lock reclaims an unreadable lock only once it is too old to be mid-write', async () => {
  const home = await temp('unreadable');
  await mkdir(join(home, 'state'), { recursive: true });
  await writeFile(lockPath(home), '');
  await assert.rejects(
    withExecutionLock(home, async () => 'must not run', { waitMs: 200 }),
    /owner unreadable/,
    'a fresh empty lock may belong to an owner that is still writing it',
  );
  const crashed = new Date(Date.now() - 60_000);
  await utimes(lockPath(home), crashed, crashed);
  assert.equal(
    await withExecutionLock(home, async () => 'reclaimed', { waitMs: 200 }),
    'reclaimed',
  );
  assert.equal(await exists(lockPath(home)), false);
});

// F10: a second execution sharing the home queues behind the first instead of failing at once.
test('execution lock waits for a live owner in another process, then runs', async () => {
  const home = await temp('queue'),
    log = join(home, 'order.log');
  const holder = spawn(
    process.execPath,
    [
      '--import',
      loader,
      '--input-type=module',
      '-e',
      `import { appendFile } from 'node:fs/promises';
import { withExecutionLock } from ${JSON.stringify(lockModule.href)};
const { HOLD_HOME: home, HOLD_LOG: log } = process.env;
await withExecutionLock(home, async () => {
  await appendFile(log, 'holder-start\\n');
  process.stdout.write('locked\\n');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await appendFile(log, 'holder-end\\n');
});`,
    ],
    { env: { ...process.env, HOLD_HOME: home, HOLD_LOG: log }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  holder.stderr.on('data', (data: Buffer) => (stderr += data.toString()));
  const exited = once(holder, 'exit');
  await new Promise<void>((resolve, reject) => {
    holder.stdout.on('data', (data: Buffer) => {
      if (data.toString().includes('locked')) resolve();
    });
    void exited.then(() => reject(new Error('holder exited before locking: ' + stderr)));
  });
  const result = await withExecutionLock(home, async () => {
    await writeFile(log, 'waiter-start\n', { flag: 'a' });
    const owner = JSON.parse(await readFile(lockPath(home), 'utf8')) as { pid: number };
    assert.equal(owner.pid, process.pid);
    return 'second';
  });
  assert.equal(result, 'second');
  const [code] = (await exited) as [number | null];
  assert.equal(code, 0, stderr);
  assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n'), [
    'holder-start',
    'holder-end',
    'waiter-start',
  ]);
  assert.equal(await exists(lockPath(home)), false);
});

// F10: after the bounded wait the error says a run is in progress, and a live lock is never broken.
test('execution lock gives up after a bounded wait without breaking a live or remote lock', async () => {
  const home = await temp('busy');
  await writeLock(home, {
    pid: process.ppid,
    host: hostname(),
    started: '2026-01-01T00:00:00.000Z',
  });
  const started = Date.now();
  await assert.rejects(
    withExecutionLock(home, async () => 'must not run', { waitMs: 300 }),
    (error: Error) => {
      assert.match(error.message, /in progress/);
      assert.match(error.message, new RegExp(`pid ${process.ppid}`));
      assert.doesNotMatch(error.message, /crashed/);
      return true;
    },
  );
  assert.ok(Date.now() - started >= 250, 'waited before giving up');
  assert.equal(
    (JSON.parse(await readFile(lockPath(home), 'utf8')) as { pid: number }).pid,
    process.ppid,
  );
  // A dead PID recorded by another host cannot be checked from here, so it is not reclaimed.
  await writeLock(home, { pid: await deadPid(), host: 'elsewhere.invalid', started: 'x' });
  await assert.rejects(
    withExecutionLock(home, async () => 'must not run', { waitMs: 200 }),
    /elsewhere\.invalid/,
  );
  assert.equal(await exists(lockPath(home)), true);
});

// F10: host timeouts send SIGTERM (terminal close sends SIGHUP); the lock must be released.
for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
  test(
    `CLI releases the execution lock when it receives ${signal}`,
    { skip: process.platform === 'win32' },
    async () => {
      const provider = await fakeProvider(true);
      try {
        const home = await omniHomeFor(provider),
          root = await gitRepository();
        const child = spawn(
          process.execPath,
          ['--import', loader, entry, 'review', root, '--json'],
          { cwd: root, env: cliEnv(home), stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let stderr = '';
        child.stderr.on('data', (data: Buffer) => (stderr += data.toString()));
        const exited = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
        await Promise.race([
          provider.completionStarted,
          exited.then(() => assert.fail('CLI exited before contacting the provider: ' + stderr)),
        ]);
        const owner = JSON.parse(await readFile(lockPath(home), 'utf8')) as { pid: number };
        assert.equal(owner.pid, child.pid);
        child.kill(signal);
        const [code, killedBy] = await exited;
        assert.equal(await exists(lockPath(home)), false, 'lock released: ' + stderr);
        assert.equal(killedBy, null, 'the CLI handled the signal instead of dying mid-run');
        assert.equal(code, 1);
        assert.match(stderr, new RegExp('Cancelled by ' + signal));
        assert.equal(await withExecutionLock(home, async () => 'next run'), 'next run');
      } finally {
        await closeProvider(provider);
      }
    },
  );
}

// F10: a run queued behind a live owner still terminates on SIGTERM and leaves the owner's lock alone.
test(
  'CLI queued for the execution lock exits on SIGTERM without touching the owner lock',
  { skip: process.platform === 'win32' },
  async () => {
    const provider = await fakeProvider(false);
    try {
      const home = await omniHomeFor(provider),
        root = await gitRepository(),
        owner = JSON.stringify({ pid: process.ppid, host: hostname(), started: 'owner' });
      await mkdir(join(home, 'state'), { recursive: true });
      await writeFile(lockPath(home), owner);
      const child = spawn(process.execPath, ['--import', loader, entry, 'review', root, '--json'], {
        cwd: root,
        env: cliEnv(home),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (data: Buffer) => (stderr += data.toString()));
      const exited = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      assert.equal(child.exitCode, null, 'still queued: ' + stderr);
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 143);
      assert.match(stderr, /Cancelled by SIGTERM/);
      assert.equal(await readFile(lockPath(home), 'utf8'), owner);
      assert.equal(provider.completions.length, 0);
    } finally {
      await closeProvider(provider);
    }
  },
);

// F18: a mistyped review path must not fall back to reviewing (and uploading) the current repository.
test('review of a missing path fails before scanning or contacting a provider', async () => {
  const provider = await fakeProvider(false);
  try {
    const home = await omniHomeFor(provider),
      parent = await temp('parent'),
      target = join(parent, 'target');
    await mkdir(target);
    await execute('git', ['init'], target);
    await writeFile(join(target, 'index.ts'), 'export const secretFixture = 1;');
    for (const typo of ['../other-repo-typo', './missing', join(parent, 'absent')]) {
      const result = await execute(
        process.execPath,
        ['--import', loader, entry, 'review', typo, '--json'],
        target,
        { env: cliEnv(home) },
      );
      assert.notEqual(result.code, 0, typo + ': ' + result.stdout);
      assert.equal(
        (JSON.parse(result.stderr) as { error: string }).error,
        'Repository path not found: ' + typo,
      );
    }
    // Outside any repository the same typo reports the missing path, not the working directory.
    const outside = await temp('outside');
    const result = await execute(
      process.execPath,
      ['--import', loader, entry, 'review', '../other-repo-typo', '--json'],
      outside,
      { env: cliEnv(home) },
    );
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Repository path not found: \.\.\/other-repo-typo/);
    assert.equal(provider.completions.length, 0, 'no repository content reached the model');
    assert.equal(provider.catalogRequests, 0);
  } finally {
    await closeProvider(provider);
  }
});

// F18 guard: a plain request word is still a request against the current repository.
test('review with a single non-path word still reviews the current repository', async () => {
  const provider = await fakeProvider(false);
  try {
    const home = await omniHomeFor(provider),
      root = await gitRepository();
    const result = await execute(
      process.execPath,
      ['--import', loader, entry, 'review', 'security', '--json'],
      root,
      { env: cliEnv(home) },
    );
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      (JSON.parse(result.stdout) as { review: { summary: string } }).review.summary,
      'Reviewed fixture',
    );
    assert.equal(provider.completions.length, 1);
    assert.match(provider.completions[0]!, /security/);
  } finally {
    await closeProvider(provider);
  }
});
