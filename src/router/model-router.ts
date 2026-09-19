import type { Config } from '../config/schema.js';
import type { Model } from '../providers/types.js';
import { permitsModel } from '../privacy/evaluator.js';
import { ConfigurationError } from '../utils/errors.js';
export interface Observation {
  attempts: number;
  passed: number;
  latencyMs: number;
}
export interface Router {
  select(models: Model[], requirements: string[], paths: string[], count?: number): Model[];
}
export class ModelRouter implements Router {
  constructor(
    private readonly config: Config,
    private readonly observations: Record<string, Observation> = {},
  ) {}
  select(models: Model[], requirements: string[], paths: string[], count = 1): Model[] {
    const eligible = models.filter(
      (m) =>
        m.healthy !== false &&
        permitsModel(this.config, m, paths) &&
        requirements.every((r) => m.capabilities.includes(r)),
    );
    const ranked = eligible.sort(
      (a, b) =>
        this.score(b) - this.score(a) ||
        `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`),
    );
    if (!ranked.length)
      throw new ConfigurationError(
        'No eligible models. Configure model capabilities and credentials; check privacy constraints.',
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
