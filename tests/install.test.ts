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
  symlink,
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
    /** A home with the omni plugin recorded as installed, a Codex directory and optional settings. */
    const home = async (scope: string, settings?: unknown) => {
      const dir = await realpath(await mkdtemp(join(tmpdir(), 'omni-plugin-')));
      await mkdir(join(dir, '.claude', 'plugins'), { recursive: true });
      await writeFile(
        join(dir, '.claude', 'plugins', 'installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: { 'omni@omnistack': [{ scope }] } }),
      );
      if (settings)
        await writeFile(join(dir, '.claude', 'settings.json'), JSON.stringify(settings));
      await mkdir(join(dir, '.codex'));
      return dir;
    };
    const run = (dir: string, ...flags: string[]) =>
      spawnSync('sh', [join(root, 'install.sh'), ...flags], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: dir,
          CLAUDE_CONFIG_DIR: '',
          XDG_CONFIG_HOME: join(dir, 'xdg'),
        },
      });
    const skills = (dir: string) => readdir(join(dir, '.claude', 'skills'));

    const user = await home('user', { enabledPlugins: { 'omni@omnistack': true } });
    const auto = run(user);
    assert.equal(auto.status, 0, auto.stderr);
    assert.match(auto.stdout, /omni plugin is installed; skipping Claude Code/);
    assert.match(auto.stdout, /codex: installed/);
    await assert.rejects(skills(user), 'no duplicate Claude Code skills');
    const explicit = run(user, '--claude');
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.ok((await skills(user)).includes('company'), '--claude still installs');

    const project = await realpath(await mkdtemp(join(tmpdir(), 'omni-plugin-project-')));
    const shared = run(await home('user'), '--project', project);
    assert.equal(shared.status, 0, shared.stderr);
    assert.ok((await skills(project)).includes('company'), 'a project install never skips');

    for (const [label, dir] of [
      ['disabled', await home('user', { enabledPlugins: { 'omni@omnistack': false } })],
      ['installed for one project only', await home('project')],
    ] as const) {
      const result = run(dir);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /skipping Claude Code/, label);
      assert.ok((await skills(dir)).includes('company'), `${label}: Claude Code gets the skills`);
    }
  },
);

test(
  'install.sh without Node.js skips Claude Code only when no plugin is installed for one project',
  { skip: process.platform === 'win32' && 'install.sh targets POSIX shells' },
  async () => {
    // A PATH with only the tools install.sh uses, so `command -v node` fails and grep decides.
    const bin = await realpath(await mkdtemp(join(tmpdir(), 'omni-no-node-')));
    const tools = ['sh', 'mktemp', 'rm', 'dirname', 'basename', 'cp', 'mkdir', 'cmp', 'diff'];
    for (const tool of [...tools, 'sed', 'grep']) {
      const found = spawnSync('sh', ['-c', `command -v ${tool}`], {
        encoding: 'utf8',
      }).stdout.trim();
      assert.ok(found.startsWith('/'), `${tool} is installed`);
      await symlink(found, join(bin, tool));
    }
    const run = async (plugins: Record<string, unknown>) => {
      const dir = await realpath(await mkdtemp(join(tmpdir(), 'omni-no-node-home-')));
      await mkdir(join(dir, '.claude', 'plugins'), { recursive: true });
      await writeFile(
        join(dir, '.claude', 'plugins', 'installed_plugins.json'),
        JSON.stringify({ version: 2, plugins }, null, 2),
      );
      return spawnSync('/bin/sh', [join(root, 'install.sh')], {
        encoding: 'utf8',
        env: { PATH: bin, HOME: dir, XDG_CONFIG_HOME: join(dir, 'xdg') },
      });
    };
    const user = await run({ 'omni@omnistack': [{ scope: 'user' }] });
    assert.equal(user.status, 0, user.stderr);
    assert.match(user.stdout, /skipping Claude Code/);
    for (const [label, plugins] of [
      ['installed for one project only', { 'omni@omnistack': [{ scope: 'project' }] }],
      [
        'another plugin installed for a project',
        { 'omni@omnistack': [{ scope: 'user' }], 'other@elsewhere': [{ scope: 'local' }] },
      ],
    ] as const) {
      const result = await run(plugins);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /claude: installed/, label);
    }
  },
);
