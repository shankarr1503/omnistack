import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function optionalRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
export async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export function redact(text: string): string {
  // Bearer/Basic credentials of any length (Basic dTpw is u:p); an all-lowercase word under 8 letters is prose.
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      '[REDACTED KEY]',
    )
    .replace(/\b(?:sk-|sk-ant-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(
      /\b([Bb]earer|[Bb]asic|BEARER|BASIC)\s+(?:[A-Za-z0-9._~+/=-]{8,}|[a-z]*[A-Z0-9._~+/=-][A-Za-z0-9._~+/=-]*)/g,
      '$1 [REDACTED]',
    )
    .replace(
      /((?:api[_-]?key|password|secret|token|authorization)\s*[=:]\s*["']?(?:(?:Bearer|Basic)\s+)?)[^\s,"'\r\n]+/gi,
      '$1[REDACTED]',
    );
}
export function safeJson(value: unknown): string {
  return redact(JSON.stringify(value, null, 2));
}
