import { mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigurationError } from '../utils/errors.js';
/** Serializes executions sharing a ledger so daily reservations cannot race across processes. */
export async function withExecutionLock<T>(home: string, run: () => Promise<T>): Promise<T> {
  await mkdir(join(home, 'state'), { recursive: true, mode: 0o700 });
  const path = join(home, 'state', 'execution.lock');
  let file;
  try {
    file = await open(path, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new ConfigurationError(
        `Another OmniStack execution owns ${path}. If it crashed, inspect the recorded PID before manually removing this lock.`,
      );
    throw error;
  }
  try {
    await file.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    return await run();
  } finally {
    await file.close();
    await rm(path, { force: true });
  }
}
