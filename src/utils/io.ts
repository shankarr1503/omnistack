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
/** Matches every placeholder `redact` can emit, including masks that a caller numbers. */
export const REDACTION_MARKER = '[REDACTED';
// Unquoted values that are code, not credentials: `token: string`, `password: str`, `= await f()`.
const CODE_WORDS = new Set(
  'string number boolean bigint symbol object any unknown never void null undefined true false none nil str int float bool bytes dict list optional await new typeof this self async function return yield const let var'.split(
    ' ',
  ),
);
const assignment =
  /((?:api[_-]?key|passw(?:or)?d|secret|token|authorization)["']?\s*[=:]\s*)(["'`]?)((?:bearer|basic)\s+)?([^\s"'`,;(){}[\]<>|&]*)/gi;
function credential(value: string, quoted: boolean, next: string | undefined): boolean {
  // Calls, generics, indexing and template or environment references are code.
  if (!value || value.startsWith('$') || (next !== undefined && '([<{'.includes(next)))
    return false;
  if (quoted) return true;
  return !CODE_WORDS.has(value.toLowerCase()) && !/^[A-Za-z_$][\w$]*(?:\.[\w$]+)+$/.test(value);
}
/**
 * Replaces likely credentials. `mask` lets a caller substitute reversible placeholders;
 * by default secrets become `[REDACTED]` and private keys `[REDACTED KEY]`.
 */
export function redact(
  text: string,
  mask: (secret: string, kind: 'key' | 'secret') => string = (_, kind) =>
    kind === 'key' ? '[REDACTED KEY]' : '[REDACTED]',
): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, (key) =>
      mask(key, 'key'),
    )
    .replace(/\b(?:sk-|sk-ant-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, (secret) =>
      mask(secret, 'secret'),
    )
    .replace(
      assignment,
      (
        match,
        prefix: string,
        quote: string,
        scheme: string | undefined,
        value: string,
        offset: number,
        whole: string,
      ) =>
        credential(value, !!quote, whole[offset + match.length])
          ? prefix + quote + (scheme ?? '') + mask(value, 'secret')
          : match,
    );
}
export function safeJson(value: unknown): string {
  return redact(JSON.stringify(value, null, 2));
}
