import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { sourceRoot, installSkills } from '../skills/compiler.js';
import { hostAdapters } from '../hosts/adapter.js';
import { execute, git } from '../utils/process.js';
import { ConfigurationError } from '../utils/errors.js';
import { doctor } from './lifecycle.js';
import { identity } from '../identity.js';
/**
 * Set to true only once this project has published `identity.package` on npm. The unscoped npm
 * name `omnistack` belongs to an unrelated package, so until then an npm update could replace
 * this runtime with someone else's code.
 */
const npmPublished = false;
const npmRefusal =
  `Update refused: this runtime is not a git checkout, and ${identity.name} is not yet published ` +
  `on npm by this project; installing "${identity.package}" from npm could fetch an unrelated ` +
  `package. Reinstall from a git checkout of the runtime and run "${identity.command} update" there.`;
export async function updateRuntime(
  home: string,
  apply: boolean,
  source = sourceRoot,
): Promise<unknown> {
  const checkout = await access(join(source, '.git'))
    .then(() => true)
    .catch(() => false);
  const refused = !checkout && !npmPublished;
  const steps = checkout
    ? [
        ['git', 'pull', '--ff-only'],
        ['npm', 'ci'],
        ['npm', 'run', 'build'],
      ]
    : refused
      ? []
      : [['npm', 'install', '-g', identity.package + '@latest']];
  if (!apply)
    return {
      source,
      method: checkout ? 'git' : 'npm',
      steps,
      instruction: refused
        ? npmRefusal
        : 'Run omni update --apply to execute this runtime-only update.',
    };
  if (refused) throw new ConfigurationError(npmRefusal);
  if (checkout && (await git(source, ['status', '--porcelain'])).trim())
    throw new Error('Runtime checkout is dirty; update refused');
  for (const [command, ...args] of steps) {
    const result =
      process.platform === 'win32' && command === 'npm'
        ? await execute(
            process.env.COMSPEC ?? 'cmd.exe',
            ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')],
            source,
            { timeout: 600000 },
          )
        : await execute(command!, args, source, { timeout: 600000 });
    if (result.code !== 0) throw new Error('Update stopped: ' + result.stderr);
  }
  await installSkills(home, hostAdapters());
  return { updated: true, doctor: await doctor(home) };
}
