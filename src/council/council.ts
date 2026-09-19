import type { Model } from '../providers/types.js';
import type { AgentRuntime } from '../agents/runtime.js';
import { ModelProposalSchema, CritiqueSchema, SynthesisSchema } from '../core/schemas.js';
import { mapConcurrent } from '../core/task-graph.js';
import { ProviderError } from '../utils/errors.js';
export function anonymize(text: string, models: Model[]): string {
  let result = text;
  for (const identity of [...new Set(models.flatMap((m) => [m.id, m.provider]))].sort(
    (a, b) => b.length - a.length,
  ))
    result = result.replace(
      new RegExp(
        '(?<![a-zA-Z0-9_])' +
          identity.replace(/[^a-zA-Z0-9_-]/g, (character) => '\\' + character) +
          '(?![a-zA-Z0-9_])',
        'gi',
      ),
      '[model]',
    );
  return result.replace(
    /\b(?:OpenAI|Anthropic|Claude|GPT[-\w.]*|Gemini|DeepSeek|Mistral|Llama|Qwen)\b/gi,
    '[model]',
  );
}
export async function council(
  runtime: AgentRuntime,
  models: Model[],
  prompt: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const selected = models.slice(0, runtime.config.budget.councilMaxModels);
  const proposals = await mapConcurrent(
    selected,
    runtime.config.execution.maxParallelModels,
    async (model) =>
      runtime.structured(
        [model],
        'independent architecture specialist',
        prompt,
        ModelProposalSchema,
        signal,
      ),
  );
  signal?.throwIfAborted();
  const unique = new Set<string>(),
    candidates: { label: string; proposal: unknown }[] = [],
    failures: string[] = [];
  for (const item of proposals) {
    if (item.status === 'rejected') {
      failures.push('A candidate failed; its proposal was excluded.');
      continue;
    }
    const anonymous = anonymize(JSON.stringify(item.value), selected);
    if (unique.has(anonymous)) continue;
    unique.add(anonymous);
    candidates.push({
      label: `Candidate ${String.fromCharCode(65 + candidates.length)}`,
      proposal: JSON.parse(anonymous) as unknown,
    });
  }
  if (!candidates.length) throw new ProviderError('All council candidates failed');
  const evidence = JSON.stringify(candidates);
  const critique = await runtime.structured(
    models,
    'critic',
    `${prompt}\nAnonymous proposals:\n${evidence}\nIdentify contradictions, risks and compatible strengths.`,
    CritiqueSchema,
    signal,
  );
  const synthesis = await runtime.structured(
    [...models].reverse(),
    'synthesizer',
    `${prompt}\nAnonymous proposals:\n${evidence}\nCritique:\n${JSON.stringify(critique)}\nCombine compatible insights, do not simply pick a winner. Identify unresolved conflicts.`,
    SynthesisSchema,
    signal,
  );
  return {
    candidates,
    critique,
    synthesis,
    failures,
    independentCandidates: candidates.length,
    degraded: candidates.length < 2,
  };
}
