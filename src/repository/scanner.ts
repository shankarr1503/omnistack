import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join } from 'node:path';
import { git } from '../utils/process.js';
import { optionalRead } from '../utils/io.js';
import { RepositoryError } from '../utils/errors.js';
import { scopedPath, sensitive } from './boundary.js';
export interface Repository {
  root: string;
  branch: string;
  status: string;
  files: string[];
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  instructions: string[];
  commands: { name: string; command: string; args: string[] }[];
  monorepo: boolean;
}
async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
/** Mirrors how spawn resolves a bare name: PATH only, trying .com and .exe on Windows. */
async function onPath(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<boolean> {
  const windows = platform === 'win32';
  for (const dir of (env.PATH ?? env.Path ?? '').split(windows ? ';' : ':'))
    for (const extension of windows ? ['.com', '.exe'] : [''])
      if (dir && (await executable(join(dir, name + extension)))) return true;
  return false;
}
/**
 * The pytest invocation for a Python project: its virtualenv, then `uv run` for uv projects,
 * then python3 or python from PATH. Windows prefers python, as python3 there is usually the
 * Microsoft Store stub. Every result is on the verification allowlist.
 */
export async function pythonTestCommand(
  root: string,
  uvLock: boolean,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<{ command: string; args: string[] }> {
  const pytest = ['-m', 'pytest'];
  for (const venv of ['.venv', 'venv']) {
    const command = venv + (platform === 'win32' ? '/Scripts/python.exe' : '/bin/python');
    if (await executable(join(root, command))) return { command, args: pytest };
  }
  // --frozen keeps verification from rewriting a stale uv.lock.
  if (uvLock && (await onPath('uv', env, platform)))
    return { command: 'uv', args: ['run', '--frozen', 'pytest'] };
  const names = platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const command of names)
    if (await onPath(command, env, platform)) return { command, args: pytest };
  // Nothing found: verification reports the check as skipped because the command is missing.
  return { command: names[0]!, args: pytest };
}
export async function scanRepository(cwd: string): Promise<Repository> {
  let root: string;
  try {
    root = await realpath((await git(cwd, ['rev-parse', '--show-toplevel'])).trim());
  } catch {
    throw new RepositoryError(`Not a Git repository: ${cwd}`);
  }
  const [branch, status, tracked] = await Promise.all([
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '(unborn)'),
    git(root, ['status', '--porcelain=v1']),
    git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']),
  ]);
  const files = [...new Set(tracked.split('\0').filter((p) => p && !sensitive(p)))];
  const languages = [
    ...new Set(
      files
        .map(
          (p) =>
            ({
              '.ts': 'TypeScript',
              '.tsx': 'TypeScript',
              '.js': 'JavaScript',
              '.py': 'Python',
              '.rs': 'Rust',
              '.go': 'Go',
              '.cpp': 'C++',
              '.c': 'C',
              '.java': 'Java',
              '.cs': 'C#',
            })[extname(p)],
        )
        .filter((x): x is string => !!x),
    ),
  ];
  let pkg: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    workspaces?: unknown;
  } = {};
  if (files.includes('package.json')) {
    try {
      pkg = JSON.parse(
        (await optionalRead(await scopedPath(root, 'package.json'))) ?? '{}',
      ) as typeof pkg;
    } catch {
      /* Malformed package files are not executable configuration. */
    }
  }
  const commands: Repository['commands'] = [];
  const packageManagers = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
    'Cargo.lock',
    'uv.lock',
    'go.mod',
  ].filter((p) => files.includes(p));
  const manager = files.includes('pnpm-lock.yaml')
    ? 'pnpm'
    : files.includes('yarn.lock')
      ? 'yarn'
      : 'npm';
  for (const name of ['build', 'typecheck', 'test', 'lint'])
    if (typeof pkg.scripts?.[name] === 'string')
      commands.push({ name, command: manager, args: ['run', name] });
  if (files.includes('Cargo.toml'))
    commands.push(
      { name: 'test', command: 'cargo', args: ['test'] },
      { name: 'build', command: 'cargo', args: ['check'] },
    );
  if (files.includes('pyproject.toml'))
    commands.push({
      name: 'test',
      ...(await pythonTestCommand(root, files.includes('uv.lock'))),
    });
  if (files.includes('go.mod'))
    commands.push({ name: 'test', command: 'go', args: ['test', './...'] });
  return {
    root,
    branch,
    status,
    files,
    languages,
    frameworks: ['react', 'next', 'vue', 'express', 'fastify', 'svelte'].filter(
      (x) => x in (pkg.dependencies ?? {}) || x in (pkg.devDependencies ?? {}),
    ),
    packageManagers,
    instructions: files.filter((p) =>
      /(^|\/)(AGENTS|CLAUDE|PROJECT|ARCHITECTURE|RULES|DECISIONS)\.md$/.test(p),
    ),
    commands,
    monorepo: !!pkg.workspaces || files.includes('pnpm-workspace.yaml'),
  };
}
export async function repositoryDiff(root: string): Promise<string> {
  return git(root, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD']).catch(() =>
    git(root, ['diff', '--no-ext-diff', '--no-textconv']),
  );
}
