import { z } from 'zod';
export const ModelSchema = z
  .object({
    id: z.string().min(1),
    capabilities: z.array(z.string()).default(['coding']),
    contextWindow: z.number().positive().optional(),
    inputUsdPerMillion: z.number().nonnegative().optional(),
    outputUsdPerMillion: z.number().nonnegative().optional(),
  })
  .strict();
export const ProviderConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    type: z.enum(['openai-compatible', 'anthropic', 'anthropic-compatible']),
    baseUrl: z.url(),
    apiKeyEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    local: z.boolean().default(false),
    models: z.array(ModelSchema).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const u = new URL(p.baseUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.username || u.password || u.search || u.hash || !['http:', 'https:'].includes(u.protocol))
      ctx.addIssue({
        code: 'custom',
        message: 'Endpoint must be HTTP(S), without embedded credentials, query or fragment',
      });
    if (p.local && !loopback)
      ctx.addIssue({ code: 'custom', message: 'Local providers must use a loopback endpoint' });
    if (u.protocol === 'http:' && !loopback)
      ctx.addIssue({ code: 'custom', message: 'Remote providers require HTTPS' });
  });
export const ConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    providers: z.array(ProviderConfigSchema).default([]),
    routing: z
      .object({
        policy: z
          .enum(['cheap', 'balanced', 'quality', 'local-only', 'privacy-first', 'custom'])
          .default('balanced'),
        preferredModels: z.array(z.string()).default([]),
      })
      .default({ policy: 'balanced', preferredModels: [] }),
    privacy: z
      .object({
        cloudAllowed: z.boolean().default(true),
        localOnly: z.boolean().default(false),
        allowedProviders: z.array(z.string()).default([]),
        deniedProviders: z.array(z.string()).default([]),
        paths: z.record(z.string(), z.object({ cloudAllowed: z.boolean() }).strict()).default({}),
      })
      .default({
        cloudAllowed: true,
        localOnly: false,
        allowedProviders: [],
        deniedProviders: [],
        paths: {},
      }),
    budget: z
      .object({
        dailyUsd: z.number().positive().nullable().default(null),
        taskUsd: z.number().positive().nullable().default(null),
        councilMaxModels: z.number().int().min(2).max(8).default(4),
      })
      .default({ dailyUsd: null, taskUsd: null, councilMaxModels: 4 }),
    execution: z
      .object({
        maxParallelModels: z.number().int().min(1).max(8).default(3),
        modelTimeout: z.number().int().min(10).max(600_000).default(60_000),
        toolTimeout: z.number().int().min(10).max(600_000).default(120_000),
        retries: z.number().int().min(0).max(5).default(2),
        repairLimit: z.number().int().min(0).max(5).default(2),
        maxToolRounds: z.number().int().min(1).max(50).default(12),
        maxContextChars: z.number().int().min(1000).max(200_000).default(40_000),
        maxOutputTokens: z.number().int().min(128).max(32768).default(4096),
      })
      .default({
        maxParallelModels: 3,
        modelTimeout: 60000,
        toolTimeout: 120000,
        retries: 2,
        repairLimit: 2,
        maxToolRounds: 12,
        maxContextChars: 40000,
        maxOutputTokens: 4096,
      }),
    approvalMode: z.enum(['strict', 'balanced', 'autonomous-safe']).default('balanced'),
    verification: z
      .array(
        z
          .object({ name: z.string(), command: z.string(), args: z.array(z.string()).default([]) })
          .strict(),
      )
      .default([]),
    telemetry: z.boolean().default(true),
    host: z
      .enum(['claude-code', 'codex', 'opencode', 'standalone', 'unknown'])
      .default('standalone'),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
