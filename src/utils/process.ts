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
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env,
      signal: options.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeout ?? 30_000);
    child.stdout.on('data', (data: Buffer) => {
      stdout = (stdout + data.toString()).slice(-512_000);
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-512_000);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new TimeoutError());
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
