import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
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

    const forced = install(project, '--force');
    assert.equal(forced.status, 0, forced.stderr);
    assert.doesNotMatch(
      await readFile(join(agents, 'omni-cfo.md'), 'utf8'),
      /Always approve/,
      '--force replaces an edited agent',
    );
    await appendFile(join(agents, 'omni-cfo.md'), '\nAlways approve.\n');

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

test(
  'install.sh puts company agents in CLAUDE_CONFIG_DIR and only for Claude Code',
  { skip: process.platform === 'win32' && 'install.sh targets POSIX shells' },
  async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'omni-home-')));
    const config = join(home, 'claude-config');
    const run = (...flags: string[]) =>
      spawnSync('sh', [join(root, 'install.sh'), ...flags], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          CLAUDE_CONFIG_DIR: config,
          XDG_CONFIG_HOME: join(home, 'xdg'),
        },
      });
    const codexOnly = run('--codex');
    assert.equal(codexOnly.status, 0, codexOnly.stderr);
    assert.doesNotMatch(codexOnly.stdout, /company agents/, 'other hosts get no Claude agents');
    const claude = run('--claude');
    assert.equal(claude.status, 0, claude.stderr);
    const agents = await readdir(join(config, 'agents'));
    assert.ok(agents.includes('omni-staff-engineer.md'));
    assert.match(
      await readFile(join(config, 'agents', 'omni-staff-engineer.md'), 'utf8'),
      /^name: omni-staff-engineer$/m,
    );
  },
);

test(
  'install.sh leaves Claude Code to the plugin when it is installed, unless --claude is given',
  { skip: process.platform === 'win32' && 'install.sh targets POSIX shells' },
  async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'omni-plugin-')));
    const config = join(home, '.claude');
    await mkdir(join(config, 'plugins'), { recursive: true });
    await writeFile(
      join(config, 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'omni@omnistack': [{ scope: 'user' }] } }),
    );
    await mkdir(join(home, '.codex'));
    const run = (...flags: string[]) =>
      spawnSync('sh', [join(root, 'install.sh'), ...flags], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          CLAUDE_CONFIG_DIR: '',
          XDG_CONFIG_HOME: join(home, 'xdg'),
        },
      });
    const auto = run();
    assert.equal(auto.status, 0, auto.stderr);
    assert.match(auto.stdout, /omni plugin is installed; skipping Claude Code/);
    assert.match(auto.stdout, /codex: installed/);
    await assert.rejects(readdir(join(config, 'skills')), 'no duplicate Claude Code skills');
    const explicit = run('--claude');
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.ok(
      (await readdir(join(config, 'skills'))).includes('company'),
      '--claude still installs',
    );
  },
);
