import type { ModelProvider, UnifiedToolCall, UnifiedToolDefinition } from '../providers/types.js';
import type { Router } from '../router/model-router.js';
import type { AgentDefinition } from '../agents/runtime.js';
import type { VerificationResult } from '../core/verifier.js';
/** Extensions are trusted executable code loaded explicitly by an embedding application. */
export interface ProviderExtension {
  kind: 'provider';
  provider: ModelProvider;
}
export interface RouterExtension {
  kind: 'router';
  router: Router;
}
export interface AgentExtension {
  kind: 'agent';
  definition: AgentDefinition;
}
export interface ToolExtension {
  kind: 'tool';
  definition: UnifiedToolDefinition;
  execute(call: UnifiedToolCall, signal: AbortSignal): Promise<unknown>;
}
export interface ValidatorExtension {
  kind: 'validator';
  validate(root: string, signal: AbortSignal): Promise<VerificationResult>;
}
/** An MCP bridge must pass every invocation through the embedding permission evaluator. */
export interface ExternalToolBridge {
  listTools(): Promise<UnifiedToolDefinition[]>;
  invoke(call: UnifiedToolCall, signal: AbortSignal): Promise<unknown>;
}
export type Extension =
  ProviderExtension | RouterExtension | AgentExtension | ToolExtension | ValidatorExtension;
