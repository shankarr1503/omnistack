import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, stat, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { execute } from '../src/utils/process.js';
import { pythonTestCommand, scanRepository } from '../src/repository/scanner.js';
import { safeCommand } from '../src/permissions/evaluator.js';
import { ToolController } from '../src/tools/controller.js';
import { verify, type VerificationResult } from '../src/core/verifier.js';
import { orchestrate } from '../src/core/orchestrator.js';
import { ConfigSchema } from '../src/config/schema.js';

// Fake interpreters are `#!/bin/sh` scripts, which Windows cannot spawn without a shell.
const posixOnly = process.platform === 'win32' ? 'fake interpreters are POSIX scripts' : false;

async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omni-python-verify-'));
}
async function pythonRepo(files: Record<string, string> = {}): Promise<string> {
  const root = await temp();
  await execute('git', ['init', '-b', 'main'], root);
  await writeFile(join(root, 'pyproject.toml'), '[project]\nname = "demo"\nversion = "0.1.0"\n');
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}
/** A runner that succeeds only for the exact argument list verification is expected to use. */
async function fakeRunner(path: string, expectedArgs: string, output: string, code = 0) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `#!/bin/sh\nif [ "$*" = "${expectedArgs}" ]; then echo "${output}"; exit ${code}; fi\necho "unexpected arguments: $*" >&2\nexit 64\n`,
    { mode: 0o755 },
  );
}
async function which(name: string): Promise<string> {
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      /* Not in this directory. */
    }
  }
  throw new Error(name + ' is not on PATH');
}
/** The reporter's machine: node and git on PATH, and no `python` executable. */
async function binWithoutPython(): Promise<string> {
  const bin = await temp();
  await symlink(await which('git'), join(bin, 'git'));
  await symlink(process.execPath, join(bin, 'node'));
  return bin;
}
async function withPath<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.PATH;
  process.env.PATH = path;
  try {
    return await run();
  } finally {
    process.env.PATH = previous;
  }
}
interface TestRun {
  status: string;
  verification: VerificationResult[];
}
async function omniTest(
  root: string,
  verification: { name: string; command: string; args: string[] }[] = [],
): Promise<TestRun> {
  return (await orchestrate(ConfigSchema.parse({ verification }), {
    root,
    home: await temp(),
    workflow: 'test',
    request: 'test',
    allowCommands: true,
  })) as TestRun;
}
function testCommand(commands: { name: string; command: string; args: string[] }[]) {
  const found = commands.find((c) => c.name === 'test');
  return found && { command: found.command, args: found.args };
}

test(
  'python3-only systems verify a pyproject repository with python3',
  { skip: posixOnly },
  async () => {
    const root = await pythonRepo(),
      bin = await binWithoutPython();
    await fakeRunner(join(bin, 'python3'), '-m pytest', '3 passed (fake python3)');
    await withPath(bin, async () => {
      const run = await omniTest(root);
      assert.equal(run.status, 'verified', JSON.stringify(run.verification));
      assert.equal(run.verification[0]?.status, 'passed');
      assert.match(run.verification[0]?.output ?? '', /fake python3/);
      assert.deepEqual(testCommand((await scanRepository(root)).commands), {
        command: 'python3',
        args: ['-m', 'pytest'],
      });
    });
  },
);

test('a user-configured python3 pytest command passes the verification allowlist', async () => {
  if (!posixOnly) {
    const root = await pythonRepo(),
      bin = await binWithoutPython();
    await fakeRunner(join(bin, 'python3'), '-m pytest', 'configured python3 ran');
    await withPath(bin, async () => {
      const run = await omniTest(root, [
        { name: 'test', command: 'python3', args: ['-m', 'pytest'] },
      ]);
      assert.equal(run.status, 'verified', JSON.stringify(run.verification));
      assert.match(run.verification[0]?.output ?? '', /configured python3 ran/);
    });
  }
  assert.ok(safeCommand('python3', ['-m', 'pytest']));
  assert.ok(safeCommand('python', ['-m', 'pytest']));
});

test(
  'a project virtualenv interpreter is preferred over PATH interpreters',
  { skip: posixOnly },
  async () => {
    for (const venv of ['.venv', 'venv']) {
      const root = await pythonRepo({ '.gitignore': venv + '/\n' }),
        bin = await binWithoutPython();
      await fakeRunner(join(bin, 'python3'), '-m pytest', 'system python3 must not run', 9);
      await fakeRunner(join(root, venv, 'bin', 'python'), '-m pytest', 'ran inside ' + venv);
      await withPath(bin, async () => {
        assert.deepEqual(testCommand((await scanRepository(root)).commands), {
          command: venv + '/bin/python',
          args: ['-m', 'pytest'],
        });
        const run = await omniTest(root);
        assert.equal(run.status, 'verified', JSON.stringify(run.verification));
        assert.match(run.verification[0]?.output ?? '', new RegExp('ran inside ' + venv));
      });
    }
  },
);

test(
  'uv projects without a virtualenv verify with uv run, without rewriting uv.lock',
  { skip: posixOnly },
  async () => {
    const root = await pythonRepo({ 'uv.lock': 'version = 1\n' }),
      bin = await binWithoutPython();
    await fakeRunner(join(bin, 'python3'), '-m pytest', 'system python3 must not run', 9);
    await fakeRunner(join(bin, 'uv'), 'run --frozen pytest', 'ran through uv');
    await withPath(bin, async () => {
      const repo = await scanRepository(root);
      assert.ok(repo.packageManagers.includes('uv.lock'));
      assert.deepEqual(testCommand(repo.commands), {
        command: 'uv',
        args: ['run', '--frozen', 'pytest'],
      });
      const run = await omniTest(root);
      assert.equal(run.status, 'verified', JSON.stringify(run.verification));
      assert.match(run.verification[0]?.output ?? '', /ran through uv/);
    });
  },
);

test(
  'uv.lock without uv installed falls back to a PATH interpreter',
  { skip: posixOnly },
  async () => {
    const root = await pythonRepo({ 'uv.lock': 'version = 1\n' }),
      bin = await binWithoutPython();
    await fakeRunner(join(bin, 'python3'), '-m pytest', 'fallback python3');
    await withPath(bin, async () => {
      assert.deepEqual(testCommand((await scanRepository(root)).commands), {
        command: 'python3',
        args: ['-m', 'pytest'],
      });
    });
  },
);

test('interpreter choice follows PATH and prefers python over the python3 stub on Windows', async () => {
  const touch = async (dir: string, name: string) => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), '', { mode: 0o755 });
  };
  const root = await temp(),
    both = await temp(),
    onlyPython3 = await temp(),
    empty = await temp();
  await touch(both, 'python.exe');
  await touch(both, 'python3.exe');
  await touch(onlyPython3, 'python3.exe');
  const win = (path: string) => pythonTestCommand(root, false, { PATH: path }, 'win32');
  assert.equal((await win(empty + ';' + both)).command, 'python');
  assert.equal((await win(onlyPython3)).command, 'python3');
  assert.equal((await win(empty)).command, 'python');
  await touch(join(root, '.venv', 'Scripts'), 'python.exe');
  assert.equal((await win(both)).command, '.venv/Scripts/python.exe');
  if (process.platform === 'win32') return; // POSIX PATH strings cannot hold drive letters.
  await touch(both, 'python');
  await touch(both, 'python3');
  const posix = (path: string) => pythonTestCommand(root, false, { PATH: path }, 'linux');
  assert.equal((await posix(both)).command, 'python3');
  assert.equal((await posix(empty)).command, 'python3');
  await writeFile(join(onlyPython3, 'python'), ''); // Not executable: spawn could not run it.
  assert.equal((await posix(onlyPython3)).command, 'python3');
});

test('a missing interpreter is reported as skipped, not as a test failure', async () => {
  const root = await pythonRepo(),
    controller = new ToolController(await scanRepository(root), await temp(), {
      write: false,
      commands: true,
      approvalMode: 'balanced',
    }),
    empty = await temp();
  const [result] = await withPath(empty, () =>
    verify(controller, [{ name: 'test', command: 'python3', args: ['-m', 'pytest'] }]),
  );
  assert.equal(result?.status, 'skipped', JSON.stringify(result));
  assert.match(result?.output ?? '', /not available/i);
  assert.match(result?.output ?? '', /python3/);
});

test(
  'omni test on a machine with no Python is unverified, not needs-attention',
  { skip: posixOnly },
  async () => {
    const root = await pythonRepo(),
      bin = await binWithoutPython();
    await withPath(bin, async () => {
      const run = await omniTest(root);
      assert.equal(run.status, 'unverified', JSON.stringify(run.verification));
      assert.equal(run.verification[0]?.status, 'skipped');
      assert.match(run.verification[0]?.output ?? '', /not available/i);
    });
  },
);

test('a configured command outside the allowlist is skipped with a note, not run or failed', async () => {
  const root = await pythonRepo(),
    controller = new ToolController(await scanRepository(root), await temp(), {
      write: false,
      commands: true,
      approvalMode: 'balanced',
    });
  const [result] = await verify(controller, [{ name: 'test', command: 'make', args: ['test'] }]);
  assert.equal(result?.status, 'skipped', JSON.stringify(result));
  assert.match(result?.output ?? '', /allowlist/);
});

test('real python test failures are still reported as failures', { skip: posixOnly }, async () => {
  const root = await pythonRepo(),
    bin = await binWithoutPython();
  await fakeRunner(join(bin, 'python3'), '-m pytest', '1 failed', 1);
  await withPath(bin, async () => {
    const run = await omniTest(root);
    assert.equal(run.status, 'needs-attention');
    assert.equal(run.verification[0]?.status, 'failed');
    assert.equal(run.verification[0]?.code, 1);
  });
});

test('the python allowlist admits only exact pytest invocations', () => {
  for (const command of ['.venv/bin/python', 'venv/bin/python'])
    assert.ok(safeCommand(command, ['-m', 'pytest']), command);
  for (const command of ['.venv/Scripts/python.exe', 'venv/Scripts/python.exe'])
    assert.ok(safeCommand(command, ['-m', 'pytest']), command);
  assert.ok(safeCommand('uv', ['run', '--frozen', 'pytest']));
  assert.ok(safeCommand('uv', ['run', 'pytest']));
  const rejected: [string, string[]][] = [
    ['python3', ['-c', 'import os']],
    ['python3', ['-m', 'pip', 'install', 'x']],
    ['python3', ['-m', 'pytest', '--rootdir=/']],
    ['python3', ['-m', 'pytest;whoami']],
    ['/usr/bin/python3', ['-m', 'pytest']],
    ['../.venv/bin/python', ['-m', 'pytest']],
    ['.venv/bin/../../evil', ['-m', 'pytest']],
    ['.venv/bin/python3.12', ['-m', 'pytest']],
    ['uv', ['run', 'sh']],
    ['uv', ['run', 'python', '-c', 'x']],
    ['uv', ['run', '--frozen', 'pytest', '-p', 'evil']],
    ['uv', ['pip', 'install', 'x']],
    ['uv', ['run', 'pytest', '&&', 'rm']],
  ];
  for (const [command, args] of rejected)
    assert.ok(!safeCommand(command, args), [command, ...args].join(' '));
});
