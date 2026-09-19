import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execute } from '../utils/process.js';
import { ConfigurationError } from '../utils/errors.js';
export type HostId = 'claude-code' | 'codex' | 'opencode' | 'standalone' | 'unknown';
export const hostIds = ['claude-code', 'codex', 'opencode'] as const;
export interface HostAdapter {
  id: HostId;
  skillDirectory: string;
  detect(): Promise<boolean>;
  capabilities(): { globalSkills: boolean; subagents: boolean };
}
export function hostAdapters(
  userHome = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): HostAdapter[] {
  return hostIds.map((id) => ({
    id,
    skillDirectory:
      id === 'claude-code'
        ? join(env.CLAUDE_CONFIG_DIR ?? join(userHome, '.claude'), 'skills')
        : id === 'codex'
          ? join(userHome, '.agents', 'skills')
          : join(env.XDG_CONFIG_HOME ?? join(userHome, '.config'), 'opencode', 'skills'),
    async detect() {
      try {
        const result = await execute(
          process.platform === 'win32' ? 'where.exe' : 'which',
          [id === 'claude-code' ? 'claude' : id],
          userHome,
        );
        return result.code === 0;
      } catch {
        return false;
      }
    },
    capabilities: () => ({ globalSkills: true, subagents: false }),
  }));
}
export function detectHost(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: HostId,
  ancestry = '',
  fallback: HostId = 'standalone',
): HostId {
  if (explicit) return explicit;
  if (hostIds.includes(env.OMNI_HOST as (typeof hostIds)[number])) return env.OMNI_HOST as HostId;
  if (env.CODEX_THREAD_ID || env.CODEX_SANDBOX) return 'codex';
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return 'claude-code';
  if (env.OPENCODE || env.OPENCODE_SESSION_ID) return 'opencode';
  if (/\bcodex\b/i.test(ancestry)) return 'codex';
  if (/\bclaude\b/i.test(ancestry)) return 'claude-code';
  if (/\bopencode\b/i.test(ancestry)) return 'opencode';
  return fallback;
}
export function invocationContext(
  env: NodeJS.ProcessEnv = process.env,
  host?: HostId,
): { id: string; host: HostId; depth: number; env: NodeJS.ProcessEnv } {
  const depth = Number(env.OMNI_DEPTH ?? 0);
  if (!Number.isInteger(depth) || depth < 0 || depth >= 3)
    throw new ConfigurationError('OmniStack recursion limit reached or invalid OMNI_DEPTH');
  const id = env.OMNI_INVOCATION_ID ?? randomUUID(),
    resolved = detectHost(env, host);
  return {
    id,
    host: resolved,
    depth: depth + 1,
    env: { OMNI_INVOCATION_ID: id, OMNI_HOST: resolved, OMNI_DEPTH: String(depth + 1) },
  };
}
