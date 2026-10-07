import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { PermissionDeniedError } from '../utils/errors.js';
export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
export function sensitive(path: string): boolean {
  return /(^|[/\\])(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.kube|node_modules)([/\\]|$)|(^|[/\\])(?:\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519|\.netrc|_netrc|\.npmrc|\.pypirc|\.pgpass|\.htpasswd|\.docker[/\\]config\.json|.*\.(?:pem|key|p12|pfx|jks|keystore|tfvars|tfstate))$/i.test(
    path,
  );
}
export async function scopedPath(root: string, requested: string, write = false): Promise<string> {
  const canonicalRoot = await realpath(root),
    target = resolve(canonicalRoot, requested);
  if (
    !inside(canonicalRoot, target) ||
    sensitive(relative(canonicalRoot, target)) ||
    (write && relative(canonicalRoot, target).split(/[/\\]/)[0] === '.omni')
  )
    throw new PermissionDeniedError(`Path is outside the permitted repository scope: ${requested}`);
  let cursor = target;
  while (cursor !== canonicalRoot) {
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink())
        throw new PermissionDeniedError(
          'Symbolic links and junctions are not allowed in repository tool paths',
        );
      if (!inside(canonicalRoot, await realpath(cursor)))
        throw new PermissionDeniedError('Canonical path escapes repository');
      if (cursor === target && stat.isFile() && stat.nlink > 1)
        throw new PermissionDeniedError('Hard-linked files are not allowed');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    cursor = dirname(cursor);
  }
  return target;
}
