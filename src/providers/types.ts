export interface UnifiedContentBlock {
  type: 'text';
  text: string;
}
export interface UnifiedToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface UnifiedToolResult {
  callId: string;
  content: string;
  isError: boolean;
}
export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: UnifiedToolCall[];
  toolCallId?: string;
}
export interface UnifiedUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}
export interface UnifiedResponse {
  content: string;
  toolCalls: UnifiedToolCall[];
  usage: UnifiedUsage;
  finishReason: string;
}
export interface ModelCapabilities {
  coding: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  vision: boolean;
  local: boolean;
}
export interface Model {
  id: string;
  provider: string;
  capabilities: string[];
  local: boolean;
  contextWindow?: number;
  inputUsdPerMillion?: number;
  outputUsdPerMillion?: number;
  healthy?: boolean;
}
export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  message: string;
  checkedAt: string;
}
export interface GenerateRequest {
  model: string;
  messages: UnifiedMessage[];
  tools?: UnifiedToolDefinition[];
  maxTokens: number;
  signal?: AbortSignal;
}
export interface ModelProvider {
  readonly id: string;
  readonly local: boolean;
  listModels(signal?: AbortSignal): Promise<Model[]>;
  generate(request: GenerateRequest): Promise<UnifiedResponse>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
}
export interface StreamingProvider extends ModelProvider {
  stream(request: GenerateRequest): AsyncIterable<UnifiedContentBlock>;
}
