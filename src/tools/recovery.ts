import { readFile, rm } from 'node:fs/promises';
import { z } from 'zod';
import { scopedPath } from '../repository/boundary.js';
import { optionalRead, atomicWrite } from '../utils/io.js';
import { contentHash } from './controller.js';
import { PermissionDeniedError } from '../utils/errors.js';
const Checkpoint = z
  .object({
    root: z.string(),
    entries: z.array(
      z.object({ path: z.string(), before: z.string().nullable(), afterHash: z.string() }).strict(),
    ),
  })
  .strict();
export async function recoverCheckpoint(
  checkpoint: string,
  apply = false,
): Promise<{ root: string; paths: string[]; restored: boolean }> {
  const data = Checkpoint.parse(JSON.parse(await readFile(checkpoint, 'utf8')));
  const grouped = new Map<string, { before: string | null; afterHash: string }>();
  for (const entry of data.entries) {
    const first = grouped.get(entry.path);
    grouped.set(entry.path, {
      before: first ? first.before : entry.before,
      afterHash: entry.afterHash,
    });
  }
  for (const [requested, entry] of grouped) {
    const path = await scopedPath(data.root, requested, true),
      current = await optionalRead(path);
    if (current === undefined || contentHash(current) !== entry.afterHash)
      throw new PermissionDeniedError(
        `Recovery would overwrite subsequent changes to ${requested}; restore this file manually from the checkpoint`,
      );
  }
  if (apply)
    for (const [requested, entry] of grouped) {
      const path = await scopedPath(data.root, requested, true);
      if (entry.before === null) await rm(path);
      else await atomicWrite(path, entry.before);
    }
  return { root: data.root, paths: [...grouped.keys()], restored: apply };
}
