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
// A quoted value runs to its closing quote; an unquoted (or unterminated) one stops at punctuation.
const assignment =
  /((?:api[_-]?key|passw(?:or)?d|secret|token|authorization)["']?\s*[=:]\s*)(?:(["'`])((?:bearer|basic)\s+)?((?:(?!\2)[^\r\n])*)\2|(["'`]?)((?:bearer|basic)\s+)?([^\s"'`,;(){}[\]<>|&]*))/gi;
function credential(value: string, quoted: boolean, next: string | undefined): boolean {
  // `$VAR`, `${...}` and `$(...)` are environment or template references, not credentials.
  if (!value || /^\$(?:[A-Za-z_{(]|$)/.test(value) || /^\[REDACTED[^\]]*\]$/.test(value))
    return false;
  if (quoted) return true;
  // Unquoted calls, generics and indexing are code.
  if (next !== undefined && '([<{'.includes(next)) return false;
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
        closed: string | undefined,
        closedScheme: string | undefined,
        closedValue: string | undefined,
        open: string | undefined,
        openScheme: string | undefined,
        openValue: string | undefined,
        offset: number,
        whole: string,
      ) => {
        const quote = closed ?? open ?? '',
          value = (closed ? closedValue : openValue) ?? '';
        if (!credential(value, !!quote, closed ? undefined : whole[offset + match.length]))
          return match;
        return (
          prefix +
          quote +
          ((closed ? closedScheme : openScheme) ?? '') +
          mask(value, 'secret') +
          (closed ?? '')
        );
      },
    );
}
export function safeJson(value: unknown): string {
  return redact(JSON.stringify(value, null, 2));
}
