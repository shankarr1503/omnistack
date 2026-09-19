import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { platform, release } from 'node:os';
import { stringify } from 'yaml';
import { ConfigSchema, type Config } from '../config/schema.js';
import { loadConfig } from '../config/loader.js';
import { hostAdapters, type HostAdapter } from '../hosts/adapter.js';
import { installSkills, uninstallSkills, sourceRoot } from '../skills/compiler.js';
import { optionalRead } from '../utils/io.js';
import { execute } from '../utils/process.js';
import { scanRepository } from '../repository/scanner.js';
import { scopedPath } from '../repository/boundary.js';
import { ModelRegistry } from '../registry/model-registry.js';
export async function setup(home: string, adapters = hostAdapters()): Promise<unknown> {
  for (const dir of ['state', 'metrics', 'cache', 'logs', 'generated', 'runtime'])
    await mkdir(join(home, dir), { recursive: true, mode: 0o700 });
  const path = join(home, 'config.yaml');
  if ((await optionalRead(path)) === undefined) {
    const providers: Config['providers'] = [];
    if (process.env.OPENAI_API_KEY)
      providers.push({
        id: 'openai',
        type: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyEnv: 'OPENAI_API_KEY',
        local: false,
        models: [],
      });
    if (process.env.ANTHROPIC_API_KEY)
      providers.push({
        id: 'anthropic',
        type: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        local: false,
        models: [],
      });
    if (process.env.OPENROUTER_API_KEY)
      providers.push({
        id: 'openrouter',
        type: 'openai-compatible',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        local: false,
        models: [],
      });
    await writeFile(path, stringify(ConfigSchema.parse({ providers })), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  await loadConfig({ home });
  const installed = await installSkills(home, adapters);
  return { installed: installed.length, home, doctor: await doctor(home, process.cwd(), adapters) };
}
export async function initProject(cwd: string): Promise<string[]> {
  const repo = await scanRepository(cwd),
    directory = await scopedPath(repo.root, '.omni');
  await mkdir(directory, { recursive: true });
  const templates: Record<string, string> = {
    'config.yaml': 'version: 1\n',
    'PROJECT.md': `# Project\n\nLanguages: ${repo.languages.join(', ') || 'Not detected'}\n`,
    'ARCHITECTURE.md': '# Architecture\n\nRecord component boundaries and data flow here.\n',
    'RULES.md': '# Repository rules\n\nRecord project conventions here.\n',
    'DECISIONS.md':
      '# Decisions\n\nRecord dated architecture decisions and their rationale here.\n',
    '.gitignore': 'state/\ntasks/\n',
    'tasks/active.json': '[]\n',
    'tasks/completed.json': '[]\n',
  };
  const created: string[] = [];
  for (const [name, text] of Object.entries(templates)) {
    const path = await scopedPath(repo.root, join('.omni', name));
    await mkdir(join(path, '..'), { recursive: true });
    try {
      await writeFile(path, text, { flag: 'wx' });
      created.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  return created;
}
export async function doctor(
  home: string,
  cwd = process.cwd(),
  adapters: HostAdapter[] = hostAdapters(),
): Promise<unknown> {
  const config = await loadConfig({ home });
  const git = await execute('git', ['--version'], cwd)
    .then((r) => r.code === 0)
    .catch(() => false);
  const repository = await scanRepository(cwd)
    .then((r) => ({ root: r.root, branch: r.branch, dirty: !!r.status, worktreeSupport: git }))
    .catch(() => null);
  const hosts = await Promise.all(
    adapters.map(async (a) => ({
      host: a.id,
      detected: await a.detect(),
      skillDirectory: a.skillDirectory,
      skills: await access(join(a.skillDirectory, 'omni', 'SKILL.md'))
        .then(() => true)
        .catch(() => false),
    })),
  );
  return {
    os: `${platform()} ${release()}`,
    node: process.version,
    git,
    source: sourceRoot,
    home,
    repository,
    hosts,
    providers: await ModelRegistry.fromConfig(config).health(),
    credentials: config.providers.map((p) => ({
      provider: p.id,
      available: !p.apiKeyEnv || !!process.env[p.apiKeyEnv],
    })),
    configuration: 'valid',
    providerNote: config.providers.length
      ? 'Catalog reachability is not an inference test.'
      : 'No providers configured. Add providers to user config.yaml.',
    permissions: config.approvalMode,
  };
}
export { uninstallSkills };
