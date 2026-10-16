import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { updateRuntime } from '../src/cli/update.js';
import { ConfigurationError } from '../src/utils/errors.js';
import { execute } from '../src/utils/process.js';
async function temp(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omni-update-' + prefix + '-'));
}
/** Puts a recording `npm` first on PATH; it exits 1 so a call can never reach a real install. */
async function withFakeNpm<T>(run: (log: string) => Promise<T>): Promise<T> {
  const bin = await temp('bin'),
    log = join(bin, 'npm-calls.log');
  await writeFile(
    join(bin, 'npm'),
    `#!/bin/sh\necho "$@" >> '${log}'\necho "fake npm ran: $@" >&2\nexit 1\n`,
  );
  await chmod(join(bin, 'npm'), 0o755);
  await writeFile(
    join(bin, 'npm.cmd'),
    `@echo %* >> "${log}"\r\n@echo fake npm ran: %* 1>&2\r\n@exit /b 1\r\n`,
  );
  const previous = process.env.PATH;
  process.env.PATH = bin + delimiter + (previous ?? '');
  try {
    return await run(log);
  } finally {
    process.env.PATH = previous;
  }
}
// F4/F13: the npm name `omnistack` belongs to an unrelated package, so a runtime that is not a
// git checkout must not be "updated" by installing `omnistack@latest` from the registry.
test('update preview for an npm installation does not plan installing omnistack@latest', async () => {
  const source = await temp('npm-runtime'),
    home = await temp('home');
  const preview = (await updateRuntime(home, false, source)) as {
    method: string;
    steps: string[][];
    instruction: string;
  };
  assert.equal(preview.method, 'npm');
  assert.deepEqual(preview.steps, []);
  assert.ok(!JSON.stringify(preview).includes('@latest'), JSON.stringify(preview));
  assert.match(preview.instruction, /refused/i);
  assert.match(preview.instruction, /git checkout/);
});
test('update --apply for an npm installation refuses without running npm', async () => {
  const source = await temp('npm-runtime'),
    home = await temp('home');
  await withFakeNpm(async (log) => {
    await assert.rejects(updateRuntime(home, true, source), (error: unknown) => {
      assert.ok(error instanceof ConfigurationError, String(error));
      assert.match(error.message, /refused/i);
      assert.match(error.message, /unrelated package/);
      return true;
    });
    const calls = await readFile(log, 'utf8').catch(() => '');
    assert.equal(calls, '', 'npm must not be invoked, but it ran: ' + calls);
  });
});
test('update preview for a git checkout still plans pull, ci and build', async () => {
  const source = await temp('git-runtime'),
    home = await temp('home');
  await execute('git', ['init'], source);
  const preview = (await updateRuntime(home, false, source)) as {
    source: string;
    method: string;
    steps: string[][];
  };
  assert.equal(preview.source, source);
  assert.equal(preview.method, 'git');
  assert.deepEqual(preview.steps, [
    ['git', 'pull', '--ff-only'],
    ['npm', 'ci'],
    ['npm', 'run', 'build'],
  ]);
});
