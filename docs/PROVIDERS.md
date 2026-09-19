# Provider interoperability

Implemented adapters:

- OpenAI-compatible Chat Completions: `/chat/completions`, `/models`, standard function tool calls and token usage.
- Anthropic and Anthropic-compatible: `/messages`, `/models`, system messages, tool use/results, usage; thinking blocks are discarded.
- Deterministic mock provider for tests and embedding, never automatically selected in production.

The OpenAI-compatible adapter is reusable for OpenAI, OpenRouter, xAI, DeepSeek, Mistral/Codestral, NVIDIA NIM, Moonshot, Z.AI, Together, Fireworks, Groq, Hugging Face routing, LiteLLM and enterprise gateways **when the endpoint implements that contract**. Compatibility does not imply that all vendor-specific features are supported. Qwen, Llama, Nemotron, Phi and other model families are model IDs served by providers, not separate protocols.

Google offers compatibility endpoints; deployments of Azure, Bedrock/Nova, Cohere, AI21, MiniMax or other native APIs can be connected through an appropriate compatible gateway or a custom `ModelProvider`. Native Gemini, AWS SigV4 and Azure identity authentication are not implemented in this release. No credentials are forwarded across endpoints by fallback: each provider resolves only its own configured environment variable. HTTP redirects are refused.

`local: true` requires a loopback hostname. Remote endpoints require TLS, without URL credentials or query strings. Remote private networks can be modeled as cloud providers with explicit allowlists; they are not silently treated as local.

Discovery caches catalog metadata for one hour, keyed by provider configuration. `omni models discover --refresh` bypasses TTL. A failed refresh can return stale data with warnings. Catalogs often lack capability metadata, so discovered capabilities default to unknown. Configure verified `coding` and `toolCalling` capability entries before routing.

Errors distinguish authentication, rate limiting, unavailability, timeouts, context overflow and malformed replies. Retryable errors back off; authentication errors are not retried against the same provider. Context overflow reduces plain-text context once, rather than blindly repeating the same request. Tool-bearing conversations are not truncated across tool call/result boundaries.

HTTP adapters use nonstreaming responses. `StreamingProvider` is an optional SDK interface, not a claim of implemented wire streaming. Structured outputs are requested as JSON and validated with Zod; malformed structured responses receive one bounded correction attempt.

Protocol references: [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat), [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create). APIs and catalogs evolve; add a provider fixture before expanding supported protocol behavior.
