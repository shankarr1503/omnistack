import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, type FileHandle } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { ConfigurationError } from '../utils/errors.js';
export interface ExecutionLockOptions {
  /** How long to queue behind a live owner before giving up. */
  waitMs?: number;
}
const DEFAULT_WAIT_MS = 10 * 60_000,
  MAX_BACKOFF_MS = 2_000,
  /** The reclaim guard is held for one read and one unlink; older means its holder died. */
  ABANDONED_GUARD_MS = 30_000;
const OwnerSchema = z.object({
  pid: z.number().int().positive(),
  host: z.string().optional(),
  started: z.string().optional(),
  token: z.string().optional(),
});
type Owner = z.infer<typeof OwnerSchema>;
/** Tokens of locks this process currently holds, so a nested run fails instead of waiting on itself. */
const heldTokens = new Set<string>();
/** Serializes executions sharing a ledger so daily reservations cannot race across processes. */
export async function withExecutionLock<T>(
  home: string,
  run: () => Promise<T>,
  options: ExecutionLockOptions = {},
): Promise<T> {
  await mkdir(join(home, 'state'), { recursive: true, mode: 0o700 });
  const path = join(home, 'state', 'execution.lock'),
    token = randomUUID();
  const file = await acquire(path, options.waitMs ?? DEFAULT_WAIT_MS);
  heldTokens.add(token);
  try {
    await file.writeFile(
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        started: new Date().toISOString(),
        token,
      }),
    );
    return await run();
  } finally {
    try {
      await file.close();
      await rm(path, { force: true });
    } finally {
      // Dropped only after removal: until then a waiter here must not judge our PID's lock stale.
      heldTokens.delete(token);
    }
  }
}
async function acquire(path: string, waitMs: number): Promise<FileHandle> {
  const deadline = Date.now() + waitMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await open(path, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const raw = await readIfPresent(path);
    if (raw === undefined) continue;
    const owner = parseOwner(raw);
    if (owner?.token !== undefined && heldTokens.has(owner.token))
      throw new ConfigurationError(
        `Another OmniStack execution in this process already owns ${path}; nested runs are not supported.`,
      );
    if (owner && !ownerMayBeAlive(owner) && (await reclaim(path, raw))) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ConfigurationError(busyMessage(path, owner, waitMs));
    await delay(Math.min(remaining, MAX_BACKOFF_MS, 100 * 2 ** attempt));
  }
}
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
/** Empty or malformed content may belong to an owner still writing it, so it is never reclaimed. */
function parseOwner(raw: string): Owner | undefined {
  try {
    const parsed = OwnerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
/** Only a PID on this host can be checked; a lock recorded elsewhere is assumed to be live. */
function ownerMayBeAlive(owner: Owner): boolean {
  if (owner.host !== undefined && owner.host !== hostname()) return true;
  // Our own PID without one of our tokens was written by an earlier process that reused it.
  if (owner.pid === process.pid) return false;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
/**
 * Removes a stale lock only if it still holds the content judged stale. The guard makes the
 * check-and-remove atomic between waiters, so one cannot delete a lock another just created.
 */
async function reclaim(path: string, stale: string): Promise<boolean> {
  const guard = path + '.reclaim';
  let handle: FileHandle;
  try {
    handle = await open(guard, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const age = await stat(guard).then(
      (s) => Date.now() - s.mtimeMs,
      () => 0,
    );
    if (age > ABANDONED_GUARD_MS) await rm(guard, { force: true });
    return false;
  }
  try {
    if ((await readIfPresent(path)) === stale) await rm(path, { force: true });
    return true;
  } finally {
    await handle.close();
    await rm(guard, { force: true });
  }
}
function busyMessage(path: string, owner: Owner | undefined, waitMs: number): string {
  const who = owner
    ? `pid ${owner.pid}${owner.host ? ` on ${owner.host}` : ''}${owner.started ? `, started ${owner.started}` : ''}`
    : 'owner unreadable';
  return (
    `Another OmniStack execution is in progress (${who}) and still holds ${path} after waiting ` +
    `${Math.round(waitMs / 1000)}s. Retry when it finishes; remove the lock only if that process is no longer running.`
  );
}
