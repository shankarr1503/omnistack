import type { Config } from '../config/schema.js';
import type { Model } from '../providers/types.js';
export function globMatches(pattern: string, path: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`).test(path.replace(/\\/g, '/'));
}
/** Restriction wins: a permissive path rule cannot relax a global prohibition. */
export function permitsModel(config: Config, model: Model, paths: string[]): boolean {
  const p = config.privacy;
  if (
    p.deniedProviders.includes(model.provider) ||
    (p.allowedProviders.length > 0 && !p.allowedProviders.includes(model.provider))
  )
    return false;
  if (!model.local && (!p.cloudAllowed || p.localOnly || config.routing.policy === 'local-only'))
    return false;
  return (
    model.local ||
    !paths.some((path) =>
      Object.entries(p.paths).some(([glob, rule]) => !rule.cloudAllowed && globMatches(glob, path)),
    )
  );
}
