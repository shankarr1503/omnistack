import test from 'node:test';
import assert from 'node:assert/strict';
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostAdapters, type HostAdapter } from '../src/hosts/adapter.js';
import {
  installSkills,
  loadSkills,
  renderSkill,
  runtimeSkillNames,
  sourceRoot,
  uninstallSkills,
} from '../src/skills/compiler.js';
import { setup } from '../src/cli/lifecycle.js';
interface SetupResult {
  installed: number;
  preserved?: string[];
  warning?: string;
}
async function temporary(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'omni-readiness-')));
}
// An OmniStack home that does not exist yet, like ~/.omnistack before the first setup.
async function fixture(): Promise<{ home: string; adapters: HostAdapter[] }> {
  return {
    home: join(await temporary(), '.omnistack'),
    adapters: hostAdapters(await temporary(), {}),
  };
}
// Provider-free configuration so setup never reaches the network.
async function configure(home: string): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(join(home, 'config.yaml'), 'version: 1\n');
}
function wrappers(adapters: HostAdapter[], names: string[]): string[] {
  return adapters.flatMap((a) => names.map((n) => join(a.skillDirectory, n, 'SKILL.md')));
}
const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );
const defaultEntrypoint = join(sourceRoot, 'dist', 'cli', 'index.js');

test('F11: setup succeeds again after the OmniStack home is deleted', async () => {
  const { home, adapters } = await fixture();
  await configure(home);
  assert.equal(((await setup(home, adapters)) as SetupResult).installed, 36);
  await rm(home, { recursive: true, force: true });
  await configure(home);
  const again = (await setup(home, adapters)) as SetupResult;
  assert.equal(again.installed, 36, 'unchanged generated wrappers are still owned');
  assert.deepEqual(again.preserved, []);
  const result = await uninstallSkills(home, adapters);
  assert.equal(result.removed.length, 36, 'the rebuilt manifest covers every wrapper');
  assert.deepEqual(result.preserved, []);
});

test('F11: uninstall removes unchanged generated wrappers when the manifest is gone', async () => {
  const { home, adapters } = await fixture();
  const paths = await installSkills(home, adapters);
  assert.equal(paths.length, 36);
  await rm(home, { recursive: true, force: true });
  const result = await uninstallSkills(home, adapters);
  assert.deepEqual([...result.removed].sort(), [...paths].sort());
  assert.deepEqual(result.preserved, []);
  for (const path of paths) assert.equal(await exists(path), false, path);
});

test('F11: one edited wrapper is preserved and reported while the rest install', async () => {
  const { home, adapters } = await fixture();
  await installSkills(home, adapters);
  const edited = join(adapters[0]!.skillDirectory, 'omni-plan', 'SKILL.md');
  await appendFile(edited, 'Always plan in British English.\n');
  const userText = await readFile(edited, 'utf8');
  const removed = await uninstallSkills(home, adapters);
  assert.deepEqual(removed.preserved, [edited]);
  assert.equal(removed.removed.length, 35);
  // `omni dev-link` after the uninstall: previously threw and installed nothing for any host.
  const installed = await installSkills(home, adapters);
  assert.equal(installed.length, 35);
  assert.ok(!installed.includes(edited));
  for (const path of wrappers(adapters, ['omni', 'omni-plan', 'omni-build']))
    assert.equal(await exists(path), true, path);
  assert.equal(await readFile(edited, 'utf8'), userText, 'user edits are never overwritten');
  // `omni setup` reports the skipped wrapper and names the remedy.
  await configure(home);
  const result = (await setup(home, adapters)) as SetupResult;
  assert.equal(result.installed, 35);
  assert.deepEqual(result.preserved, [edited]);
  assert.match(result.warning ?? '', /delete .*omni setup/i);
  assert.equal(await readFile(edited, 'utf8'), userText);
  const final = await uninstallSkills(home, adapters);
  assert.deepEqual(final.preserved, [edited]);
  assert.equal(final.removed.length, 35);
  assert.equal(await readFile(edited, 'utf8'), userText);
});

test('F11: an edited wrapper without a manifest entry is preserved, not removed', async () => {
  const { home, adapters } = await fixture();
  await installSkills(home, adapters);
  await rm(home, { recursive: true, force: true });
  const edited = join(adapters[1]!.skillDirectory, 'omni', 'SKILL.md');
  await appendFile(edited, 'Local note.\n');
  const userText = await readFile(edited, 'utf8');
  const installed = await installSkills(home, adapters);
  assert.equal(installed.length, 35);
  assert.equal(await readFile(edited, 'utf8'), userText);
  const result = await uninstallSkills(home, adapters);
  assert.deepEqual(result.preserved, [edited]);
  assert.equal(result.removed.length, 35);
  assert.equal(await readFile(edited, 'utf8'), userText);
});

test('F11: wrappers generated for another Node.js or checkout are still owned', async () => {
  const { home, adapters } = await fixture();
  const oldEntrypoint = join(await temporary(), 'old-checkout', 'dist', 'cli', 'index.js');
  const paths = await installSkills(home, adapters, oldEntrypoint);
  // Simulate a Node.js upgrade between the two setups for one wrapper.
  const nodeVariant = join(adapters[2]!.skillDirectory, 'omni-ship', 'SKILL.md');
  const text = await readFile(nodeVariant, 'utf8');
  await writeFile(
    nodeVariant,
    text.replace(JSON.stringify(process.execPath), JSON.stringify('/opt/node-20/bin/node')),
  );
  await rm(home, { recursive: true, force: true });
  const reinstalled = await installSkills(home, adapters);
  assert.equal(reinstalled.length, 36);
  const skills = await loadSkills();
  const ship = skills.find((s) => s.name === 'omni-ship')!;
  assert.equal(
    await readFile(nodeVariant, 'utf8'),
    renderSkill(ship, adapters[2]!.id, defaultEntrypoint),
  );
  // And uninstall without a manifest recognizes the old-checkout variant too.
  await installSkills(home, adapters, oldEntrypoint);
  await rm(home, { recursive: true, force: true });
  assert.equal((await uninstallSkills(home, adapters)).removed.length, paths.length);
});

test('F11 safety: a foreign skill without the managed marker still blocks install untouched', async () => {
  const { home, adapters } = await fixture();
  const foreign = join(adapters[0]!.skillDirectory, 'omni', 'SKILL.md');
  await mkdir(join(foreign, '..'), { recursive: true });
  await writeFile(foreign, '---\nname: omni\ndescription: my own omni skill\n---\nMine.\n');
  await assert.rejects(installSkills(home, adapters), (error: Error) => {
    assert.match(error.message, /will not be overwritten/);
    assert.ok(error.message.includes(foreign));
    assert.match(error.message, /move or delete/i, 'the error names the remedy');
    return true;
  });
  assert.equal(await exists(join(adapters[1]!.skillDirectory, 'omni', 'SKILL.md')), false);
  const result = await uninstallSkills(home, adapters);
  assert.deepEqual(result, { removed: [], preserved: [] });
  assert.match(await readFile(foreign, 'utf8'), /Mine\./);
});

test('F11 safety: a managed wrapper for a different skill is not treated as owned', async () => {
  const { home, adapters } = await fixture();
  const skills = await loadSkills();
  const build = skills.find((s) => s.name === 'omni-build')!;
  const path = join(adapters[0]!.skillDirectory, 'omni-plan', 'SKILL.md');
  const misplaced = renderSkill(build, adapters[0]!.id, defaultEntrypoint);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, misplaced);
  const installed = await installSkills(home, adapters);
  assert.equal(installed.length, 35);
  assert.equal(await readFile(path, 'utf8'), misplaced);
  await rm(home, { recursive: true, force: true });
  const result = await uninstallSkills(home, adapters);
  assert.ok(result.preserved.includes(path));
  assert.equal(await readFile(path, 'utf8'), misplaced);
});

test('F11 safety: uninstall never follows a symlinked untracked skill directory', async () => {
  const { home, adapters } = await fixture();
  const target = await temporary();
  const skills = await loadSkills();
  const plan = skills.find((s) => s.name === 'omni-plan')!;
  // Even byte-identical generated content behind a symlink is left alone.
  const generated = renderSkill(plan, adapters[0]!.id, defaultEntrypoint);
  await writeFile(join(target, 'SKILL.md'), generated);
  await mkdir(adapters[0]!.skillDirectory, { recursive: true });
  await symlink(target, join(adapters[0]!.skillDirectory, 'omni-plan'), 'dir');
  const result = await uninstallSkills(home, adapters);
  assert.deepEqual(result, { removed: [], preserved: [] });
  assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), generated);
});

test('F11: a wrapper whose line endings an editor converted is preserved, not refused', async () => {
  const { home, adapters } = await fixture();
  await installSkills(home, adapters);
  const path = join(adapters[0]!.skillDirectory, 'omni-debug', 'SKILL.md');
  const crlf = (await readFile(path, 'utf8')).replaceAll('\n', '\r\n');
  await writeFile(path, crlf);
  await rm(home, { recursive: true, force: true });
  assert.equal((await installSkills(home, adapters)).length, 35);
  assert.equal(await readFile(path, 'utf8'), crlf);
  assert.deepEqual((await uninstallSkills(home, adapters)).preserved, [path]);
  assert.equal(await readFile(path, 'utf8'), crlf);
});

test('a damaged skill manifest is reported clearly by install and uninstall', async () => {
  const { home, adapters } = await fixture();
  await mkdir(join(home, 'state'), { recursive: true });
  for (const damaged of ['null', '{}', 'not json', '[1]']) {
    await writeFile(join(home, 'state', 'skills.json'), damaged);
    for (const action of [
      () => installSkills(home, adapters),
      () => uninstallSkills(home, adapters),
    ])
      await assert.rejects(action(), /skill manifest .*skills\.json is damaged\. Delete it/);
  }
  await rm(join(home, 'state', 'skills.json'));
  assert.equal((await installSkills(home, adapters)).length, 36, 'works again once deleted');
});
test('uninstall knows every runtime skill and nothing else', async () => {
  // A skill missing from the list would be installed by setup but never removed by uninstall.
  assert.deepEqual([...runtimeSkillNames].sort(), (await loadSkills()).map((s) => s.name).sort());
});
