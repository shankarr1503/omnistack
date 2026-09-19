import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { git } from '../utils/process.js';
import { inside } from '../repository/boundary.js';
import { PermissionDeniedError } from '../utils/errors.js';
export class WorktreeManager {
  constructor(
    readonly root: string,
    readonly home: string,
  ) {}
  async create(task: string): Promise<{ path: string; branch: string }> {
    if (!/^[a-z0-9-]{1,50}$/.test(task)) throw new Error('Invalid worktree task name');
    if ((await git(this.root, ['status', '--porcelain'])).trim())
      throw new PermissionDeniedError(
        'Worktrees require a clean base; preserve existing user changes explicitly',
      );
    const id = task + '-' + randomUUID().slice(0, 8),
      parent = join(this.home, 'worktrees'),
      path = join(parent, id),
      branch = 'omni/' + id;
    await mkdir(parent, { recursive: true });
    await git(this.root, ['worktree', 'add', '-b', branch, path]);
    return { path, branch };
  }
  async remove(path: string): Promise<void> {
    if (
      !inside(resolve(this.home, 'worktrees'), resolve(path)) ||
      resolve(path) === resolve(this.home, 'worktrees')
    )
      throw new PermissionDeniedError('Not a managed worktree path');
    if ((await git(path, ['status', '--porcelain'])).trim())
      throw new PermissionDeniedError('Dirty worktree retained for recovery');
    await git(this.root, ['worktree', 'remove', path]);
  }
  async integrationPreview(branch: string): Promise<string> {
    if (!/^omni\/[a-z0-9-]+$/.test(branch)) throw new PermissionDeniedError('Not a managed branch');
    return git(this.root, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD...' + branch]);
  }
}
