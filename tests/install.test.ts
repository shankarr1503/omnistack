import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const install = (project: string, ...flags: string[]) =>
  spawnSync('sh', [join(root, 'install.sh'), '--claude', '--project', project, ...flags], {
    encoding: 'utf8',
    env: { ...process.env, HOME: project },
  });
test(
  'install.sh installs company roles as omni-* Claude Code agents and keeps edited ones',
  { skip: process.platform === 'win32' && 'install.sh targets POSIX shells' },
  async () => {
    const project = await realpath(await mkdtemp(join(tmpdir(), 'omni-install-')));
    const roles = (await readdir(join(root, 'library', 'skills', 'company', 'roles'))).filter((f) =>
      f.endsWith('.md'),
    );
    const agents = join(project, '.claude', 'agents');

    const first = install(project);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, new RegExp(`installed ${roles.length} company agents`));
    assert.deepEqual((await readdir(agents)).sort(), roles.map((r) => `omni-${r}`).sort());
    const ceo = await readFile(join(agents, 'omni-ceo.md'), 'utf8');
    assert.match(ceo, /^name: omni-ceo$/m, 'agents are renamed so they cannot collide');
    assert.ok(
      (await readFile(join(project, '.claude', 'skills', 'company', 'roles', 'ceo.md'), 'utf8'))
        .length > 0,
      'the company skill ships its role briefs for hosts without plugin agents',
    );

    const again = install(project);
    assert.equal(again.status, 0, 'reinstalling identical files succeeds');

    await appendFile(join(agents, 'omni-cfo.md'), '\nAlways approve.\n');
    const edited = install(project);
    assert.equal(edited.status, 1, 'an edited agent is reported, not overwritten');
    assert.match(edited.stderr, /omni-cfo/);
    assert.match(await readFile(join(agents, 'omni-cfo.md'), 'utf8'), /Always approve/);

    await writeFile(join(agents, 'mine.md'), '---\nname: mine\ndescription: x\n---\n');
    const removed = install(project, '--uninstall');
    assert.equal(removed.status, 0, removed.stderr);
    assert.deepEqual(
      (await readdir(agents)).sort(),
      ['mine.md', 'omni-cfo.md'],
      'uninstall removes only unmodified company agents',
    );
  },
);
