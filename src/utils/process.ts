import { spawn } from 'node:child_process';
import { TimeoutError } from './errors.js';
import { redact } from './io.js';
export interface CommandResult {
  command: string[];
  code: number;
  stdout: string;
  stderr: string;
}
/** Never invokes a shell. Callers must authorize executable and arguments first. */
export async function execute(
  command: string,
  args: string[],
  cwd: string,
  options: { timeout?: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  options.signal?.throwIfAborted();
  // On POSIX the child leads its own process group, so cancelling or timing out also stops
  // the processes it started (npm -> node test.js); killing only the child would orphan them.
  const group = process.platform !== 'win32';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      detached: group,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      timedOut = false,
      aborted = false;
    const stop = () => {
      if (group && child.pid !== undefined)
        try {
          process.kill(-child.pid, 'SIGTERM');
          return;
        } catch {
          // The group is already gone; fall back to the child itself.
        }
      child.kill();
    };
    const onAbort = () => {
      aborted = true;
      stop();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeout ?? 30_000);
    const settle = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    child.stdout.on('data', (data: Buffer) => {
      stdout = (stdout + data.toString()).slice(-512_000);
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-512_000);
    });
    child.once('error', (error) => {
      settle();
      reject(error);
    });
    child.once('close', (code) => {
      settle();
      if (aborted) reject(options.signal?.reason ?? new Error('The operation was aborted'));
      else if (timedOut) reject(new TimeoutError());
      else
        resolve({
          command: [command, ...args],
          code: code ?? 1,
          stdout: redact(stdout),
          stderr: redact(stderr),
        });
    });
  });
}
export async function git(root: string, args: string[]): Promise<string> {
  const result = await execute(
    'git',
    [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      root,
      ...args,
    ],
    root,
  );
  if (result.code) throw new Error(`Git failed: ${result.stderr.trim()}`);
  return result.stdout.trimEnd();
}
