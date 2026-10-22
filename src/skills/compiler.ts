import { readdir, readFile, lstat, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { HostAdapter } from '../hosts/adapter.js';
import { atomicWrite, optionalRead } from '../utils/io.js';
import { ConfigurationError, PermissionDeniedError } from '../utils/errors.js';
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
const marker = '<!-- omnistack:managed -->';
export function renderSkill(
  skill: Skill,
  host: string,
  entrypoint: string,
  node = process.execPath,
): string {
  return `---\n${stringify({ name: skill.name, description: skill.description })}---\n${marker}\n${skill.body}\nRuntime: invoke Node.js with the following argument array (use the host shell's proper quoting):\n\n${JSON.stringify([node, entrypoint, 'skill', 'run', skill.name, '--host', host, '--repo', '<absolute target repository>', '--', '<user request>'])}\n\nReplace placeholders with the current target repository and request. Keep the target working directory. Do not run from the runtime installation. Pass --allow-write only when the user authorized implementation. Repository commands require --allow-commands because even tests can execute arbitrary repository code. Do not recursively invoke host CLIs. Report runtime errors, skipped checks, and partial results accurately.\n`;
}
function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
const ManagedFiles = z.array(z.object({ path: z.string(), hash: z.string() }));
type ManagedFile = z.infer<typeof ManagedFiles>[number];
/** The record of wrappers OmniStack wrote. Wrappers are recognized without it, so a damaged one can go. */
async function readManifest(path: string): Promise<ManagedFile[]> {
  const text = await optionalRead(path);
  if (text === undefined) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const parsed = ManagedFiles.safeParse(value);
  if (!parsed.success)
    throw new ConfigurationError(
      `The skill manifest ${path} is damaged. Delete it and run the command again; OmniStack recognizes its own unedited wrappers without it.`,
    );
  return parsed.data;
}
const RuntimeArguments = z.tuple([
  z.string(),
  z.string(),
  z.literal('skill'),
  z.literal('run'),
  z.string(),
  z.literal('--host'),
  z.string(),
  z.literal('--repo'),
  z.literal('<absolute target repository>'),
  z.literal('--'),
  z.literal('<user request>'),
]);
function hasMarker(text: string): boolean {
  return text.split(/\r?\n/).includes(marker);
}
// Owned means recorded in the manifest, or byte-identical to what renderSkill produces for this
// skill with any host, entrypoint or Node.js path (so a lost manifest or a Node.js upgrade does not
// orphan wrappers). The runtime line is only parsed to re-render; nothing from the file is run.
function owned(text: string, skill: Skill | undefined, managed?: ManagedFile): boolean {
  if (managed?.hash === hash(text)) return true;
  if (!skill || !hasMarker(text)) return false;
  return text.split('\n').some((line) => {
    if (!line.startsWith('[')) return false;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return false;
    }
    const args = RuntimeArguments.safeParse(value);
    return (
      args.success &&
      args.data[4] === skill.name &&
      renderSkill(skill, args.data[6], args.data[1], args.data[0]) === text
    );
  });
}
async function plainFile(path: string): Promise<boolean> {
  try {
    return (await lstat(dirname(path))).isDirectory() && (await lstat(path)).isFile();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw e;
  }
}
async function rejectSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new PermissionDeniedError(`Refusing managed symlink: ${path}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
export interface SkillInstallReport {
  installed: string[];
  /** Edited OmniStack wrappers left untouched; delete one and install again to regenerate it. */
  preserved: string[];
}
export async function installSkillsReport(
  home: string,
  adapters: HostAdapter[],
  entrypoint = join(sourceRoot, 'dist', 'cli', 'index.js'),
): Promise<SkillInstallReport> {
  const manifestPath = join(home, 'state', 'skills.json');
  const previous = await readManifest(manifestPath);
  const skills = await loadSkills(),
    files: { path: string; text: string }[] = [],
    preserved: string[] = [],
    foreign: string[] = [];
  for (const adapter of adapters) {
    await rejectSymlink(adapter.skillDirectory);
    for (const skill of skills) {
      const path = join(adapter.skillDirectory, skill.name, 'SKILL.md');
      await rejectSymlink(dirname(path));
      await rejectSymlink(path);
      const existing = await optionalRead(path),
        managed = previous.find((f) => f.path === path);
      if (existing !== undefined && !owned(existing, skill, managed)) {
        (hasMarker(existing) ? preserved : foreign).push(path);
        continue;
      }
      files.push({ path, text: renderSkill(skill, adapter.id, entrypoint) });
    }
  }
  if (foreign.length)
    throw new PermissionDeniedError(
      `Existing skill without the OmniStack marker will not be overwritten: ${foreign.join(', ')}. Move or delete it, then run omni setup again.`,
    );
  const manifest = [...previous];
  for (const file of files) {
    await atomicWrite(file.path, file.text);
    const index = manifest.findIndex((f) => f.path === file.path);
    if (index >= 0) manifest.splice(index, 1);
    manifest.push({ path: file.path, hash: hash(file.text) });
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return { installed: files.map((f) => f.path), preserved };
}
export async function installSkills(
  home: string,
  adapters: HostAdapter[],
  entrypoint?: string,
): Promise<string[]> {
  return (await installSkillsReport(home, adapters, entrypoint)).installed;
}
export async function uninstallSkills(
  home: string,
  adapters: HostAdapter[],
): Promise<{ removed: string[]; preserved: string[] }> {
  const manifestPath = join(home, 'state', 'skills.json'),
    manifest = await readManifest(manifestPath);
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
  // Uninstall must still work from a damaged checkout; without skills only manifest hashes prove
  // ownership, which is the conservative outcome.
  const skills = await loadSkills().catch((): Skill[] => []),
    skillFor = (path: string): Skill | undefined =>
      skills.find((s) => s.name === basename(dirname(path)));
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
    if (existing !== undefined && !owned(existing, skillFor(file.path), file)) {
      preserved.push(file.path);
      continue;
    }
    await rm(file.path, { force: true });
    removed.push(file.path);
  }
  // Wrappers without a manifest entry (for example after ~/.omnistack was deleted) are removed only
  // when they are unchanged generated output; edited ones are reported, foreign files ignored.
  for (const path of allowed) {
    if (manifest.some((f) => f.path === path) || !(await plainFile(path))) continue;
    const existing = await readFile(path, 'utf8');
    if (!hasMarker(existing)) continue;
    if (owned(existing, skillFor(path))) {
      await rm(path, { force: true });
      removed.push(path);
    } else preserved.push(path);
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
