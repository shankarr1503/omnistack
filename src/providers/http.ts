import { z } from 'zod';
import type { ProviderConfig } from '../config/schema.js';
import type {
  GenerateRequest,
  Model,
  ModelProvider,
  ProviderHealth,
  UnifiedResponse,
} from './types.js';
import {
  AuthenticationError,
  ContextOverflowError,
  ModelUnavailableError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from '../utils/errors.js';
import { redact } from '../utils/io.js';
const Usage = z
  .object({
    prompt_tokens: z.number().default(0),
    completion_tokens: z.number().default(0),
    input_tokens: z.number().default(0),
    output_tokens: z.number().default(0),
  })
  .default({ prompt_tokens: 0, completion_tokens: 0, input_tokens: 0, output_tokens: 0 });
const OpenAIResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: Usage,
});
const AnthropicResponse = z.object({
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.record(z.string(), z.unknown()),
      }),
      z.object({ type: z.literal('thinking') }),
      z.object({ type: z.literal('redacted_thinking') }),
    ]),
  ),
  usage: Usage,
  stop_reason: z.string().nullable().optional(),
});
/** Catalog checks gate routing, so they get a short budget independent of execution.modelTimeout. */
export const HEALTH_CHECK_TIMEOUT_MS = 10_000;
/** Error shapes of OpenAI, Anthropic, Ollama, vLLM and FastAPI-based servers. */
const ErrorBody = z.union([
  z.object({ error: z.object({ message: z.string() }) }),
  z.object({ error: z.string() }),
  z.object({ message: z.string() }),
  z.object({ detail: z.string() }),
]);
const DETAIL_LIMIT = 300;
/** Provider-supplied text made safe for an error message: redacted, one line, bounded. */
function sanitize(text: string): string {
  const line = redact(text)
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim();
  return line.length > DETAIL_LIMIT ? `${line.slice(0, DETAIL_LIMIT)}…` : line;
}
/** The structured error message from a JSON error body; raw text and HTML are never echoed. */
function errorMessage(body: string): string | undefined {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return undefined;
  }
  const parsed = ErrorBody.safeParse(json);
  if (!parsed.success) return undefined;
  const data = parsed.data;
  const text =
    'error' in data
      ? typeof data.error === 'string'
        ? data.error
        : data.error.message
      : 'message' in data
        ? data.message
        : data.detail;
  return sanitize(text) || undefined;
}
/** Why fetch failed, including the network cause (for example ECONNREFUSED or a TLS error). */
function connectionFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'network error';
  const summary = error.message || error.name;
  const cause: unknown = error.cause;
  if (!(cause instanceof Error)) return sanitize(summary);
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
  const causes: unknown[] =
    cause instanceof AggregateError ? [cause, ...(cause.errors as unknown[])] : [cause];
  const text = [...new Set(causes.map((c) => (c instanceof Error ? c.message : '')))]
    .filter(Boolean)
    .join('; ');
  const detail = code && !text.includes(code) ? (text ? `${code}: ${text}` : code) : text;
  return sanitize(detail ? `${summary} (${detail})` : summary);
}
export class HttpProvider implements ModelProvider {
  readonly id: string;
  readonly local: boolean;
  constructor(
    readonly config: ProviderConfig,
    private readonly timeout = 60000,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly transport: typeof fetch = fetch,
  ) {
    this.id = config.id;
    this.local = config.local;
  }
  private get anthropic(): boolean {
    return this.config.type.startsWith('anthropic');
  }
  /** OpenAI rejects max_tokens for reasoning models; other compatible servers expect it. */
  private get tokenLimit(): 'max_tokens' | 'max_completion_tokens' {
    return new URL(this.config.baseUrl).hostname === 'api.openai.com'
      ? 'max_completion_tokens'
      : 'max_tokens';
  }
  private async request(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const key = this.config.apiKeyEnv ? this.env[this.config.apiKeyEnv] : undefined;
    if (this.config.apiKeyEnv && !key)
      throw new AuthenticationError(`Set ${this.config.apiKeyEnv} for provider ${this.id}`);
    const timeout = AbortSignal.timeout(this.timeout);
    let response: Response;
    try {
      response = await this.transport(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: {
          'content-type': 'application/json',
          ...(this.anthropic
            ? { 'anthropic-version': '2023-06-01', ...(key ? { 'x-api-key': key } : {}) }
            : key
              ? { authorization: `Bearer ${key}` }
              : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new TimeoutError();
      throw new ProviderError(
        `Connection failed for ${this.id}: ${connectionFailure(error)}`,
        true,
      );
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new AuthenticationError();
      if (response.status === 429) throw new RateLimitError();
      if (response.status === 404) throw new ModelUnavailableError();
      const text = await response.text();
      if (/context.{0,30}(length|window|limit)|too many tokens/i.test(text.slice(0, 4000)))
        throw new ContextOverflowError();
      const reason = errorMessage(text);
      throw new ProviderError(
        `Provider ${this.id} returned HTTP ${response.status}${reason ? `: ${reason}` : ''}`,
        response.status >= 500,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ProviderError('Provider returned malformed JSON');
    }
  }
  async listModels(signal?: AbortSignal): Promise<Model[]> {
    const catalog = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(await this.request('/models', undefined, signal));
    return catalog.data.map((m) => ({
      id: m.id,
      provider: this.id,
      local: this.local,
      capabilities: this.config.models.find((c) => c.id === m.id)?.capabilities ?? [],
      ...this.config.models.find((c) => c.id === m.id),
    }));
  }
  /** Rejects with the caller's cancellation reason; any other failure reports unhealthy. */
  async healthCheck(
    signal?: AbortSignal,
    timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
  ): Promise<ProviderHealth> {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      await this.listModels(signal ? AbortSignal.any([signal, timeout]) : timeout);
      return {
        provider: this.id,
        healthy: true,
        message: 'Model catalog reachable; inference not tested',
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return {
        provider: this.id,
        healthy: false,
        message: timeout.aborted
          ? `Health check timed out after ${timeoutMs} ms`
          : error instanceof Error
            ? error.message
            : 'Health check failed',
        checkedAt: new Date().toISOString(),
      };
    }
  }
  async generate(req: GenerateRequest): Promise<UnifiedResponse> {
    if (this.anthropic) {
      const messages = req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'tool' ? 'user' : m.role,
          content:
            m.role === 'tool'
              ? [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }]
              : m.toolCalls?.length
                ? [
                    ...(m.content ? [{ type: 'text', text: m.content }] : []),
                    ...m.toolCalls.map((t) => ({
                      type: 'tool_use',
                      id: t.id,
                      name: t.name,
                      input: t.arguments,
                    })),
                  ]
                : m.content,
        }));
      const raw = await this.request(
        '/messages',
        {
          model: req.model,
          system: req.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n'),
          messages,
          max_tokens: req.maxTokens,
          ...(req.tools?.length
            ? {
                tools: req.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.parameters,
                })),
              }
            : {}),
        },
        req.signal,
      );
      const parsed = AnthropicResponse.safeParse(raw);
      if (!parsed.success) throw new ProviderError('Invalid Anthropic response schema');
      const data = parsed.data;
      return {
        content: data.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n'),
        toolCalls: data.content
          .filter((b) => b.type === 'tool_use')
          .map((b) => ({ id: b.id, name: b.name, arguments: b.input })),
        usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
        finishReason: data.stop_reason ?? 'unknown',
      };
    }
    const messages = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolCalls?.length
        ? {
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: 'function',
              function: { name: t.name, arguments: JSON.stringify(t.arguments) },
            })),
          }
        : {}),
    }));
    const raw = await this.request(
      '/chat/completions',
      {
        model: req.model,
        messages,
        [this.tokenLimit]: req.maxTokens,
        ...(req.tools?.length
          ? { tools: req.tools.map((t) => ({ type: 'function', function: t })) }
          : {}),
      },
      req.signal,
    );
    const parsed = OpenAIResponse.safeParse(raw);
    if (!parsed.success) throw new ProviderError('Invalid OpenAI-compatible response schema');
    const choice = parsed.data.choices[0]!;
    try {
      return {
        content: choice.message.content ?? '',
        toolCalls: (choice.message.tool_calls ?? []).map((t) => ({
          id: t.id,
          name: t.function.name,
          arguments: z.record(z.string(), z.unknown()).parse(JSON.parse(t.function.arguments)),
        })),
        usage: {
          inputTokens: parsed.data.usage.prompt_tokens,
          outputTokens: parsed.data.usage.completion_tokens,
        },
        finishReason: choice.finish_reason ?? 'unknown',
      };
    } catch {
      throw new ProviderError('Invalid tool-call arguments');
    }
  }
}
