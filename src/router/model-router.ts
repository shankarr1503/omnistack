import type { Config } from '../config/schema.js';
import type { Model, ProviderHealth } from '../providers/types.js';
import { permitsModel } from '../privacy/evaluator.js';
import { ConfigurationError, ProviderError } from '../utils/errors.js';
export interface Observation {
  attempts: number;
  passed: number;
  latencyMs: number;
}
export interface Router {
  select(models: Model[], requirements: string[], paths: string[], count?: number): Model[];
}
const LISTED = 5;
function listed(items: string[], separator = ', '): string {
  return items.length > LISTED
    ? `${items.slice(0, LISTED).join(separator)} and ${items.length - LISTED} more`
    : items.join(separator);
}
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
function name(model: Model): string {
  return `${model.provider}/${model.id}`;
}
export class ModelRouter implements Router {
  constructor(
    private readonly config: Config,
    private readonly observations: Record<string, Observation> = {},
    /** Health checks behind each model's `healthy` flag; their messages explain exclusions. */
    private readonly health: readonly ProviderHealth[] = [],
  ) {}
  select(models: Model[], requirements: string[], paths: string[], count = 1): Model[] {
    const incapable: Model[] = [],
      denied: Model[] = [],
      unhealthy: Model[] = [],
      eligible: Model[] = [];
    for (const m of models)
      if (!requirements.every((r) => m.capabilities.includes(r))) incapable.push(m);
      else if (!permitsModel(this.config, m, paths)) denied.push(m);
      else if (m.healthy === false) unhealthy.push(m);
      else eligible.push(m);
    if (!eligible.length) throw this.noEligibleModels(requirements, incapable, denied, unhealthy);
    const ranked = eligible.sort(
      (a, b) =>
        this.score(b) - this.score(a) ||
        `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`),
    );
    const selected: Model[] = [];
    while (ranked.length && selected.length < count) {
      const index = selected.length
        ? ranked.findIndex(
            (m) =>
              !selected.some((s) => s.provider === m.provider) &&
              this.score(m) >= this.score(ranked[0]!) - 3,
          )
        : 0;
      selected.push(ranked.splice(index < 0 ? 0 : index, 1)[0]!);
    }
    return selected;
  }
  /** Name each exclusion reason so the error points at the actual fix. */
  private noEligibleModels(
    requirements: string[],
    incapable: Model[],
    denied: Model[],
    unhealthy: Model[],
  ): ConfigurationError | ProviderError {
    if (!incapable.length && !denied.length && !unhealthy.length)
      return new ConfigurationError(
        'No models are configured or discovered. List models under a provider in the configuration; `omni models discover` and `omni providers health` show what each provider offers.',
      );
    const reasons: string[] = [],
      hints: string[] = [];
    if (incapable.length) {
      reasons.push(
        `${plural(incapable.length, 'model')} without required capabilities [${requirements.join(', ')}] (${listed(incapable.map(name))})`,
      );
      hints.push("Declare capabilities under the provider's models in the configuration.");
    }
    if (denied.length) {
      reasons.push(
        `${plural(denied.length, 'model')} blocked by privacy settings (${listed(denied.map(name))})`,
      );
      hints.push('Review the privacy settings and routing policy, or add a permitted provider.');
    }
    if (unhealthy.length) {
      const providers = [...new Set(unhealthy.map((m) => m.provider))];
      const details = providers.flatMap((provider) => {
        const check = this.health.find((h) => h.provider === provider && !h.healthy);
        return check ? [`${provider}: ${check.message.replace(/\.$/, '')}`] : [];
      });
      reasons.push(
        `${plural(unhealthy.length, 'model')} on unhealthy providers (${listed(providers)})`,
      );
      hints.push(
        details.length
          ? `Provider health: ${listed(details, '; ')}. Run \`omni providers health\` to recheck.`
          : 'Run `omni providers health` to see why.',
      );
    }
    const message = `No eligible models: ${reasons.join('; ')}. ${hints.join(' ')}`;
    // A model that only needs its provider back is an availability problem, not configuration.
    return unhealthy.length ? new ProviderError(message) : new ConfigurationError(message);
  }
  private score(model: Model): number {
    const key = `${model.provider}/${model.id}`,
      history = this.observations[key],
      cost = (model.inputUsdPerMillion ?? 10) + (model.outputUsdPerMillion ?? 20);
    const preferred = this.config.routing.preferredModels.includes(key) ? 10 : 0;
    return (
      preferred +
      (model.healthy ? 2 : 0) +
      (history ? ((history.passed + 1) / (history.attempts + 2)) * 4 : 2) +
      (this.config.routing.policy === 'privacy-first' && model.local ? 20 : 0) -
      cost *
        (this.config.routing.policy === 'cheap'
          ? 1
          : this.config.routing.policy === 'quality'
            ? 0
            : 0.05)
    );
  }
}
