import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { Model, ModelProvider, ProviderHealth } from '../providers/types.js';
import { HttpProvider } from '../providers/http.js';
import { atomicWrite, optionalRead } from '../utils/io.js';
export class ModelRegistry {
  readonly providers = new Map<string, ModelProvider>();
  readonly models = new Map<string, Model>();
  register(provider: ModelProvider, models: Model[] = []): void {
    if (this.providers.has(provider.id)) throw new Error(`Duplicate provider ${provider.id}`);
    this.providers.set(provider.id, provider);
    for (const model of models) this.models.set(`${model.provider}/${model.id}`, model);
  }
  static fromConfig(config: Config): ModelRegistry {
    const registry = new ModelRegistry();
    for (const p of config.providers)
      registry.register(
        new HttpProvider(p, config.execution.modelTimeout),
        p.models.map((m) => ({ ...m, provider: p.id, local: p.local })),
      );
    return registry;
  }
  async discover(
    home: string,
    refresh = false,
    ttlMs = 3600000,
  ): Promise<{ models: Model[]; warnings: string[] }> {
    const warnings: string[] = [];
    for (const provider of this.providers.values()) {
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify(provider instanceof HttpProvider ? provider.config : { id: provider.id }),
        )
        .digest('hex')
        .slice(0, 24);
      const path = join(home, 'cache', `models-${fingerprint}.json`);
      let cached: { at: number; models: Model[] } | undefined;
      try {
        cached = JSON.parse((await optionalRead(path)) ?? 'null') as typeof cached;
      } catch {
        /* Corrupt caches are disposable. */
      }
      let discovered: Model[];
      if (!refresh && cached && Date.now() - cached.at < ttlMs) discovered = cached.models;
      else {
        try {
          discovered = await provider.listModels();
          await atomicWrite(path, JSON.stringify({ at: Date.now(), models: discovered }));
        } catch (error) {
          discovered = cached?.models ?? [];
          warnings.push(
            `${provider.id}: ${error instanceof Error ? error.message : 'discovery failed'}${cached ? ' (stale cache)' : ''}`,
          );
        }
      }
      for (const model of discovered)
        if (!this.models.has(`${model.provider}/${model.id}`))
          this.models.set(`${model.provider}/${model.id}`, model);
    }
    return { models: [...this.models.values()], warnings };
  }
  async health(): Promise<ProviderHealth[]> {
    return Promise.all([...this.providers.values()].map((p) => p.healthCheck()));
  }
}
