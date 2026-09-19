import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { UnifiedUsage, Model } from '../providers/types.js';
import type { Config } from '../config/schema.js';
import { optionalRead } from '../utils/io.js';
import { OmniError } from '../utils/errors.js';
export interface ExecutionMetric {
  at: string;
  provider: string;
  model: string;
  repository: string;
  category: string;
  language: string;
  latencyMs: number;
  retries: number;
  usage: UnifiedUsage;
  status: 'completed' | 'failed';
  verified?: boolean;
}
export class Ledger {
  constructor(readonly home: string) {}
  async record(metric: ExecutionMetric): Promise<void> {
    await mkdir(join(this.home, 'metrics'), { recursive: true, mode: 0o700 });
    await appendFile(
      join(this.home, 'metrics', 'executions.jsonl'),
      `${JSON.stringify(metric)}\n`,
      { mode: 0o600 },
    );
  }
  async read(): Promise<ExecutionMetric[]> {
    return ((await optionalRead(join(this.home, 'metrics', 'executions.jsonl'))) ?? '')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ExecutionMetric];
        } catch {
          return [];
        }
      });
  }
  async usage(): Promise<{
    calls: number;
    inputTokens: number;
    outputTokens: number;
    knownUsd: number;
    unpricedCalls: number;
  }> {
    const rows = await this.read();
    return {
      calls: rows.length,
      inputTokens: rows.reduce((a, r) => a + r.usage.inputTokens, 0),
      outputTokens: rows.reduce((a, r) => a + r.usage.outputTokens, 0),
      knownUsd: rows.reduce((a, r) => a + (r.usage.costUsd ?? 0), 0),
      unpricedCalls: rows.filter((r) => r.usage.costUsd === undefined).length,
    };
  }
}
export function repositoryKey(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 24);
}
/** Per-invocation reservation prevents parallel calls overspending the same task allowance. */
export class Budget {
  private spent = 0;
  private reserved = 0;
  constructor(
    private readonly config: Config,
    private readonly dailySpent = 0,
  ) {}
  reserve(model: Model, inputChars: number): (usage?: UnifiedUsage) => void {
    const priced =
      model.inputUsdPerMillion !== undefined && model.outputUsdPerMillion !== undefined;
    const estimate = priced
      ? ((inputChars * 4 + 4096) * model.inputUsdPerMillion! +
          this.config.execution.maxOutputTokens * model.outputUsdPerMillion!) /
        1e6
      : 0;
    const { taskUsd, dailyUsd } = this.config.budget;
    if (!priced && (taskUsd !== null || dailyUsd !== null))
      throw new OmniError(
        'BUDGET',
        'Hard budgets require configured input/output pricing for every selected model',
      );
    if (
      (taskUsd !== null && this.spent + this.reserved + estimate > taskUsd) ||
      (dailyUsd !== null && this.dailySpent + this.spent + this.reserved + estimate > dailyUsd)
    )
      throw new OmniError('BUDGET', 'Configured budget would be exceeded');
    this.reserved += estimate;
    let settled = false;
    return (usage) => {
      if (settled) return;
      settled = true;
      this.reserved -= estimate;
      this.spent += usage?.costUsd ?? estimate;
    };
  }
}
