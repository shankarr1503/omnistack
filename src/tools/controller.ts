import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { UnifiedToolCall, UnifiedToolDefinition } from '../providers/types.js';
import type { Repository } from '../repository/scanner.js';
import { scopedPath } from '../repository/boundary.js';
import { authorize, safeCommand, type Grants } from '../permissions/evaluator.js';
import { atomicWrite, optionalRead, redact } from '../utils/io.js';
import { execute, git, type CommandResult } from '../utils/process.js';
import { PermissionDeniedError } from '../utils/errors.js';
import { invocationContext } from '../hosts/adapter.js';
const schemas = {
  read_file: z.object({ path: z.string() }).strict(),
  write_file: z
    .object({
      path: z.string(),
      content: z.string().max(256000),
      expectedHash: z.string().nullable(),
    })
    .strict(),
  edit_file: z
    .object({ path: z.string(), oldText: z.string().min(1), newText: z.string() })
    .strict(),
  list_directory: z.object({ path: z.string().default('.') }).strict(),
  search_files: z.object({ query: z.string().min(1).max(200) }).strict(),
  git_status: z.object({}).strict(),
  git_diff: z.object({}).strict(),
  run_command: z.object({ command: z.string(), args: z.array(z.string()) }).strict(),
};
export const toolDefinitions: UnifiedToolDefinition[] = Object.entries(schemas).map(
  ([name, schema]) => ({
    name,
    description:
      name === 'write_file'
        ? 'Write a file: expectedHash must match read_file SHA256, or null for a new file.'
        : 'Repository-scoped ' + name,
    parameters: z.toJSONSchema(schema),
  }),
);
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
/** Recovery preimages remain local and never enter provider prompts. */
export class ToolController {
  readonly journal: { path: string; before: string | null; afterHash: string }[] = [];
  readonly checkpoint: string;
  constructor(
    readonly repo: Repository,
    readonly home: string,
    readonly grants: Grants,
    readonly timeout = 120000,
    readonly allowedPath: (path: string) => boolean = () => true,
    readonly signal?: AbortSignal,
  ) {
    this.checkpoint = join(home, 'state', 'checkpoints', randomUUID() + '.json');
  }
  definitions(): UnifiedToolDefinition[] {
    return toolDefinitions.filter(
      (t) =>
        (this.grants.write || !['write_file', 'edit_file'].includes(t.name)) &&
        (this.grants.commands || t.name !== 'run_command'),
    );
  }
  private async path(requested: string, write = false): Promise<string> {
    const path = await scopedPath(this.repo.root, requested, write),
      rel = relative(this.repo.root, path).replace(/\\/g, '/');
    if (!this.allowedPath(rel))
      throw new PermissionDeniedError('Privacy policy denies access to ' + rel);
    return path;
  }
  private async read(requested: string): Promise<string> {
    const path = await this.path(requested);
    if ((await stat(path)).size > 256000)
      throw new PermissionDeniedError('File exceeds tool size limit');
    const text = await readFile(path, 'utf8');
    if (text.includes('\0')) throw new PermissionDeniedError('Binary files cannot be read');
    return text;
  }
  private async write(
    requested: string,
    content: string,
    expectedHash: string | null,
  ): Promise<unknown> {
    authorize('write', this.grants);
    const path = await this.path(requested, true),
      before = await optionalRead(path);
    if ((before === undefined ? null : contentHash(before)) !== expectedHash)
      throw new PermissionDeniedError('File changed since read; reread before editing');
    this.journal.push({
      path: relative(this.repo.root, path),
      before: before ?? null,
      afterHash: contentHash(content),
    });
    await atomicWrite(
      this.checkpoint,
      JSON.stringify({ root: this.repo.root, entries: this.journal }),
    );
    await atomicWrite(await this.path(requested, true), content);
    const rel = relative(this.repo.root, path).replace(/\\/g, '/');
    if (!this.repo.files.includes(rel)) this.repo.files.push(rel);
    return { path: rel, hash: contentHash(content), changed: true };
  }
  async call(call: UnifiedToolCall): Promise<unknown> {
    this.signal?.throwIfAborted();
    switch (call.name) {
      case 'read_file': {
        const a = schemas.read_file.parse(call.arguments),
          text = await this.read(a.path);
        return { content: redact(text), hash: contentHash(text) };
      }
      case 'write_file': {
        const a = schemas.write_file.parse(call.arguments);
        return this.write(a.path, a.content, a.expectedHash);
      }
      case 'edit_file': {
        const a = schemas.edit_file.parse(call.arguments),
          text = await this.read(a.path);
        if (text.split(a.oldText).length !== 2)
          throw new PermissionDeniedError('Edit must match exactly once');
        // A replacer function keeps `$&`, `$$` and similar sequences in newText literal.
        return this.write(
          a.path,
          text.replace(a.oldText, () => a.newText),
          contentHash(text),
        );
      }
      case 'list_directory': {
        const a = schemas.list_directory.parse(call.arguments);
        await this.path(a.path);
        return this.repo.files
          .filter(
            (p) =>
              this.allowedPath(p) &&
              p.startsWith(a.path === '.' ? '' : a.path.replace(/\/$/, '') + '/'),
          )
          .slice(0, 500);
      }
      case 'search_files': {
        const a = schemas.search_files.parse(call.arguments),
          matches: { path: string; line: number; text: string }[] = [];
        for (const path of this.repo.files.slice(0, 1000)) {
          if (matches.length >= 100) break;
          try {
            const content = await this.read(path);
            content.split('\n').forEach((line, index) => {
              if (line.includes(a.query) && matches.length < 100)
                matches.push({ path, line: index + 1, text: redact(line.slice(0, 300)) });
            });
          } catch {
            /* Unsafe files are excluded. */
          }
        }
        return matches;
      }
      case 'git_status':
        schemas.git_status.parse(call.arguments);
        return git(this.repo.root, ['status', '--porcelain=v1']);
      case 'git_diff':
        schemas.git_diff.parse(call.arguments);
        return this.filteredDiff();
      case 'run_command': {
        const a = schemas.run_command.parse(call.arguments);
        return this.command(a.command, a.args);
      }
      default:
        throw new PermissionDeniedError('Unknown tool: ' + call.name);
    }
  }
  /** Changed paths from Git plus this run's journal; never the whole repository. */
  private async changedFiles(): Promise<{ path: string; untracked: boolean }[]> {
    const changed = new Map<string, boolean>();
    const fields = (
      await git(this.repo.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    ).split('\0');
    for (let i = 0; i < fields.length; i++) {
      const entry = fields[i]!;
      if (entry.length < 4) continue;
      changed.set(entry.slice(3), entry.startsWith('??'));
      // Renames and copies are followed by their source path.
      if (/^[RC]|^.[RC]/.test(entry)) i++;
    }
    for (const entry of this.journal) {
      const path = entry.path.replace(/\\/g, '/');
      if (!changed.has(path)) changed.set(path, true);
    }
    return [...changed].map(([path, untracked]) => ({ path, untracked }));
  }
  async filteredDiff(): Promise<string> {
    const chunks: string[] = [];
    // Per-file reads also cover untracked files; no raw repository-wide diff reaches a model.
    for (const { path: file, untracked } of (await this.changedFiles()).slice(0, 200)) {
      try {
        await this.path(file);
      } catch {
        continue; // Privacy and boundary exclusions.
      }
      const diff = untracked
        ? ''
        : await git(this.repo.root, [
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            'HEAD',
            '--',
            file,
          ]).catch(() => '');
      if (diff) chunks.push(diff);
      else
        await this.read(file)
          .then((text) => chunks.push('New or untracked file: ' + file + '\n' + text))
          .catch(() => undefined);
    }
    return redact(chunks.join('\n').slice(0, 100000));
  }
  async command(command: string, args: string[]): Promise<CommandResult> {
    authorize('command', this.grants);
    if (!safeCommand(command, args))
      throw new PermissionDeniedError('Command is outside the verification allowlist');
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'PATH',
      'Path',
      'SystemRoot',
      'WINDIR',
      'TEMP',
      'TMP',
      'HOME',
      'USERPROFILE',
      'PATHEXT',
      'COMSPEC',
    ])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, invocationContext().env, { CI: '1', GIT_TERMINAL_PROMPT: '0' });
    if (process.platform === 'win32' && ['npm', 'pnpm', 'yarn'].includes(command)) {
      return execute(
        process.env.COMSPEC ?? 'cmd.exe',
        ['/d', '/s', '/c', command + '.cmd run ' + args[1]!],
        this.repo.root,
        { timeout: this.timeout, signal: this.signal, env },
      );
    }
    return execute(command, args, this.repo.root, {
      timeout: this.timeout,
      signal: this.signal,
      env,
    });
  }
}
