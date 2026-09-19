import { z } from 'zod';
export const ModelProposalSchema = z
  .object({
    proposal: z.string().min(1),
    assumptions: z.array(z.string()),
    risks: z.array(z.string()),
    alternatives: z.array(z.string()),
    filesLikelyAffected: z.array(z.string()),
    testPlan: z.array(z.string()),
    securityConcerns: z.array(z.string()),
    confidenceNotes: z.string(),
  })
  .strict();
export const ReviewFindingSchema = z
  .object({
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.enum([
      'correctness',
      'security',
      'reliability',
      'maintainability',
      'performance',
      'testing',
    ]),
    file: z.string(),
    evidence: z.string(),
    recommendation: z.string(),
  })
  .strict();
export const ReviewSchema = z
  .object({ summary: z.string(), findings: z.array(ReviewFindingSchema) })
  .strict();
export const TaskPlanSchema = z
  .object({
    summary: z.string(),
    tasks: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            dependencies: z.array(z.string()),
            targetFiles: z.array(z.string()),
            validation: z.array(z.string()),
          })
          .strict(),
      )
      .min(1),
    risks: z.array(z.string()),
  })
  .strict();
export const CritiqueSchema = z
  .object({
    strengths: z.array(z.string()),
    contradictions: z.array(z.string()),
    risks: z.array(z.string()),
    unresolved: z.array(z.string()),
  })
  .strict();
export const SynthesisSchema = z
  .object({
    recommendation: z.string(),
    combinedInsights: z.array(z.string()),
    tradeoffs: z.array(z.string()),
    unresolvedConflicts: z.array(z.string()),
    implementationPlan: z.array(z.string()),
    verification: z.array(z.string()),
  })
  .strict();
export function parseOutput<T>(schema: z.ZodType<T>, text: string): T {
  return schema.parse(
    JSON.parse(text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')) as unknown,
  );
}
export function schemaInstruction(schema: z.ZodType): string {
  return `Return only JSON matching this schema: ${JSON.stringify(z.toJSONSchema(schema))}. Provide concise conclusions and evidence, never hidden reasoning traces.`;
}
