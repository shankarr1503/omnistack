import type {
  GenerateRequest,
  Model,
  ModelProvider,
  ProviderHealth,
  UnifiedResponse,
} from './types.js';
export class MockProvider implements ModelProvider {
  readonly local = true;
  readonly calls: GenerateRequest[] = [];
  constructor(
    readonly id = 'mock',
    private readonly replies: (
      | UnifiedResponse
      | Error
      | ((request: GenerateRequest) => UnifiedResponse | Promise<UnifiedResponse>)
    )[] = [],
  ) {}
  async listModels(): Promise<Model[]> {
    return [
      {
        id: `${this.id}-model`,
        provider: this.id,
        local: true,
        capabilities: ['coding', 'toolCalling', 'structuredOutput'],
        inputUsdPerMillion: 0,
        outputUsdPerMillion: 0,
      },
    ];
  }
  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.id,
      healthy: true,
      message: 'Test double, no network',
      checkedAt: new Date().toISOString(),
    };
  }
  async generate(request: GenerateRequest): Promise<UnifiedResponse> {
    this.calls.push(structuredClone({ ...request, signal: undefined }));
    request.signal?.throwIfAborted();
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    if (!reply) throw new Error('Mock response queue exhausted');
    return typeof reply === 'function' ? reply(request) : reply;
  }
}
export function mockResponse(content: unknown): UnifiedResponse {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: 'stop',
  };
}
