import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { sourceRoot, installSkills } from '../skills/compiler.js';
import { hostAdapters } from '../hosts/adapter.js';
import { execute, git } from '../utils/process.js';
import { doctor } from './lifecycle.js';
import { identity } from '../identity.js';
export async function updateRuntime(home: string, apply: boolean): Promise<unknown> {
  const checkout = await access(join(sourceRoot, '.git'))
    .then(() => true)
    .catch(() => false);
  const steps = checkout
    ? [
        ['git', 'pull', '--ff-only'],
        ['npm', 'ci'],
        ['npm', 'run', 'build'],
      ]
    : [['npm', 'install', '-g', identity.package + '@latest']];
  if (!apply)
    return {
      source: sourceRoot,
      method: checkout ? 'git' : 'npm',
      steps,
      instruction: 'Run omni update --apply to execute this runtime-only update.',
    };
  if (checkout && (await git(sourceRoot, ['status', '--porcelain'])).trim())
    throw new Error('Runtime checkout is dirty; update refused');
  for (const [command, ...args] of steps) {
    const result =
      process.platform === 'win32' && command === 'npm'
        ? await execute(
            process.env.COMSPEC ?? 'cmd.exe',
            ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')],
            sourceRoot,
            { timeout: 600000 },
          )
        : await execute(command!, args, sourceRoot, { timeout: 600000 });
    if (result.code !== 0) throw new Error('Update stopped: ' + result.stderr);
  }
  await installSkills(home, hostAdapters());
  return { updated: true, doctor: await doctor(home) };
}
