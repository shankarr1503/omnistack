import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../scripts/check-plugin-version.mjs', import.meta.url));
test('the plugin version must go up when library/ changes', async () => {
  const repo = await realpath(await mkdtemp(join(tmpdir(), 'omni-version-')));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo });
  const manifest = (version: string) =>
    writeFile(join(repo, 'library', '.claude-plugin', 'plugin.json'), JSON.stringify({ version }));
  const check = () =>
    spawnSync(process.execPath, [script, 'main'], { cwd: repo, encoding: 'utf8' });
  await mkdir(join(repo, 'library', '.claude-plugin'), { recursive: true });
  await mkdir(join(repo, 'library', 'skills', 'x'), { recursive: true });
  await manifest('1.1.0');
  await writeFile(join(repo, 'library', 'skills', 'x', 'SKILL.md'), 'one\n');
  await writeFile(join(repo, 'README.md'), 'readme\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('checkout', '-qb', 'change');

  await writeFile(join(repo, 'README.md'), 'readme, edited\n');
  git('commit', '-qam', 'docs only');
  assert.equal(check().status, 0, 'changes outside library/ need no bump');

  await writeFile(join(repo, 'library', 'skills', 'x', 'SKILL.md'), 'two\n');
  git('commit', '-qam', 'skill change');
  const stale = check();
  assert.equal(stale.status, 1, 'a library change without a bump fails');
  assert.match(stale.stderr, /at least 1\.1\.1/);

  await manifest('1.1.1');
  git('commit', '-qam', 'bump');
  assert.equal(check().status, 0, stale.stderr);

  await manifest('1.0.9');
  git('commit', '-qam', 'downgrade');
  assert.equal(check().status, 1, 'a lower version fails');
});
