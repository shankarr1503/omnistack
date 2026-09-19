import { readdir, readFile, lstat, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { HostAdapter } from '../hosts/adapter.js';
import { atomicWrite, optionalRead } from '../utils/io.js';
import { PermissionDeniedError } from '../utils/errors.js';
export const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const SkillSchema = z.object({
  name: z.string().regex(/^omni(?:-[a-z]+)?$/),
  description: z.string().min(10),
});
export interface Skill {
  name: string;
  description: string;
  body: string;
}
export async function loadSkills(root = join(sourceRoot, 'skills')): Promise<Skill[]> {
  const skills: Skill[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const text = await readFile(join(root, entry.name, 'SKILL.md'), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    if (!match) throw new Error(`Invalid skill: ${entry.name}`);
    skills.push({ ...SkillSchema.parse(parse(match[1]!)), body: match[2]! });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
export function renderSkill(skill: Skill, host: string, entrypoint: string): string {
  return `---\n${stringify({ name: skill.name, description: skill.description })}---\n<!-- omnistack:managed -->\n${skill.body}\nRuntime: invoke Node.js with the following argument array (use the host shell's proper quoting):\n\n${JSON.stringify([process.execPath, entrypoint, 'skill', 'run', skill.name, '--host', host, '--repo', '<absolute target repository>', '--', '<user request>'])}\n\nReplace placeholders with the current target repository and request. Keep the target working directory. Do not run from the runtime installation. Pass --allow-write only when the user authorized implementation. Repository commands require --allow-commands because even tests can execute arbitrary repository code. Do not recursively invoke host CLIs. Report runtime errors, skipped checks, and partial results accurately.\n`;
}
function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
interface ManagedFile {
  path: string;
  hash: string;
}
async function rejectSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new PermissionDeniedError(`Refusing managed symlink: ${path}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
export async function installSkills(
  home: string,
  adapters: HostAdapter[],
  entrypoint = join(sourceRoot, 'dist', 'cli', 'index.js'),
): Promise<string[]> {
  const manifestPath = join(home, 'state', 'skills.json');
  const previous = JSON.parse((await optionalRead(manifestPath)) ?? '[]') as ManagedFile[];
  const skills = await loadSkills(),
    files: { path: string; text: string }[] = [];
  for (const adapter of adapters) {
    await rejectSymlink(adapter.skillDirectory);
    for (const skill of skills) {
      const path = join(adapter.skillDirectory, skill.name, 'SKILL.md');
      await rejectSymlink(dirname(path));
      await rejectSymlink(path);
      const existing = await optionalRead(path),
        managed = previous.find((f) => f.path === path);
      if (existing !== undefined && (!managed || managed.hash !== hash(existing)))
        throw new PermissionDeniedError(
          `Existing or modified skill will not be overwritten: ${path}`,
        );
      files.push({ path, text: renderSkill(skill, adapter.id, entrypoint) });
    }
  }
  const manifest = [...previous];
  for (const file of files) {
    await atomicWrite(file.path, file.text);
    const index = manifest.findIndex((f) => f.path === file.path);
    if (index >= 0) manifest.splice(index, 1);
    manifest.push({ path: file.path, hash: hash(file.text) });
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return files.map((f) => f.path);
}
export async function uninstallSkills(
  home: string,
  adapters: HostAdapter[],
): Promise<{ removed: string[]; preserved: string[] }> {
  const manifestPath = join(home, 'state', 'skills.json'),
    manifest = JSON.parse((await optionalRead(manifestPath)) ?? '[]') as ManagedFile[];
  const allowed = new Set(
    adapters.flatMap((a) =>
      [
        'omni',
        ...[
          'plan',
          'build',
          'architect',
          'council',
          'debug',
          'review',
          'security',
          'test',
          'research',
          'optimize',
          'ship',
        ].map((s) => `omni-${s}`),
      ].map((s) => join(a.skillDirectory, s, 'SKILL.md')),
    ),
  );
  const removed: string[] = [],
    preserved: string[] = [];
  for (const file of manifest) {
    if (!allowed.has(file.path)) {
      preserved.push(file.path);
      continue;
    }
    await rejectSymlink(dirname(file.path));
    await rejectSymlink(file.path);
    const existing = await optionalRead(file.path);
    if (existing !== undefined && hash(existing) !== file.hash) {
      preserved.push(file.path);
      continue;
    }
    await rm(file.path, { force: true });
    removed.push(file.path);
  }
  await atomicWrite(
    manifestPath,
    JSON.stringify(manifest.filter((f) => preserved.includes(f.path))),
  );
  return { removed, preserved };
}
export function managedSection(original: string, content: string): string {
  const start = '<!-- omnistack:start -->',
    end = '<!-- omnistack:end -->';
  const first = original.indexOf(start),
    last = original.indexOf(end);
  if (first >= 0 !== last >= 0 || (first >= 0 && last < first))
    throw new Error('Malformed managed section');
  const block = `${start}\n${content}\n${end}`;
  return first < 0
    ? `${original}${original.endsWith('\n') || !original ? '' : '\n'}${block}\n`
    : original.slice(0, first) + block + original.slice(last + end.length);
}
