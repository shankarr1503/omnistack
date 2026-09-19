import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { ConfigSchema, type Config } from './schema.js';
import { optionalRead } from '../utils/io.js';
import { ConfigurationError } from '../utils/errors.js';
import { identity } from '../identity.js';
export function omniHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.OMNI_HOME ?? join(homedir(), identity.directory));
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function merge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new ConfigurationError('Unsafe configuration key');
    result[key] = object(value) && object(result[key]) ? merge(result[key], value) : value;
  }
  return result;
}
async function readConfig(path: string): Promise<Record<string, unknown>> {
  const text = await optionalRead(path);
  if (text === undefined) return {};
  try {
    const parsed: unknown = parse(text, { maxAliasCount: 20 });
    if (!object(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new ConfigurationError(`Invalid YAML configuration: ${path}`);
  }
}
export async function loadConfig(
  options: {
    root?: string;
    home?: string;
    env?: NodeJS.ProcessEnv;
    flags?: Record<string, unknown>;
  } = {},
): Promise<Config> {
  const env = options.env ?? process.env;
  const global = await readConfig(join(options.home ?? omniHome(env), 'config.yaml'));
  const project = options.root ? await readConfig(join(options.root, '.omni', 'config.yaml')) : {};
  for (const key of ['providers', 'approvalMode', 'verification', 'host'])
    if (key in project)
      throw new ConfigurationError(
        `Project configuration cannot set trusted option '${key}'; use user configuration`,
      );
  let config = merge(merge(global, project), {
    ...(env.OMNI_POLICY ? { routing: { policy: env.OMNI_POLICY } } : {}),
    ...(env.OMNI_CLOUD_ALLOWED
      ? { privacy: { cloudAllowed: env.OMNI_CLOUD_ALLOWED === 'true' } }
      : {}),
  });
  config = merge(config, options.flags ?? {});
  // Repository files can tighten privacy, but cannot authorize cloud access denied by the user.
  const trusted = ConfigSchema.parse(global).privacy;
  if (object(config.privacy)) {
    if (!trusted.cloudAllowed) config.privacy.cloudAllowed = false;
    if (trusted.localOnly) config.privacy.localOnly = true;
    const effective = config.privacy;
    effective.deniedProviders = [
      ...new Set([
        ...trusted.deniedProviders,
        ...(Array.isArray(effective.deniedProviders)
          ? (effective.deniedProviders as string[])
          : []),
      ]),
    ];
    if (trusted.allowedProviders.length)
      effective.allowedProviders =
        Array.isArray(effective.allowedProviders) && effective.allowedProviders.length
          ? effective.allowedProviders.filter((p) => trusted.allowedProviders.includes(String(p)))
          : trusted.allowedProviders;
    if (
      trusted.allowedProviders.length &&
      Array.isArray(effective.allowedProviders) &&
      !effective.allowedProviders.length
    )
      throw new ConfigurationError('Provider allowlists have no intersection');
    const paths = object(effective.paths) ? effective.paths : {};
    for (const [pattern, rule] of Object.entries(trusted.paths))
      if (!rule.cloudAllowed) paths[pattern] = rule;
    effective.paths = paths;
  }
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success)
    throw new ConfigurationError(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  if (parsed.data.budget.dailyUsd !== null && !parsed.data.telemetry)
    throw new ConfigurationError('Daily budgets require the local usage ledger');
  if (new Set(parsed.data.providers.map((p) => p.id)).size !== parsed.data.providers.length)
    throw new ConfigurationError('Duplicate provider IDs');
  return parsed.data;
}
