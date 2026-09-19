# Configuration and trust

Precedence is defaults → user YAML → project YAML → supported environment variables → explicit CLI flags. Arrays replace; nested maps merge. Unknown keys and invalid ranges fail validation.

Environment settings: `OMNI_HOME`, `OMNI_POLICY`, `OMNI_CLOUD_ALLOWED`, and each provider's named credential variable. Invocation metadata uses `OMNI_INVOCATION_ID`, `OMNI_HOST`, and `OMNI_DEPTH`; nesting is limited to three. The implementation never launches a host CLI as a subagent.

Trusted-only fields are `providers`, `approvalMode`, `verification`, and `host`. A checked-out project cannot change endpoints to steal API keys or define its own trusted commands. Global privacy denials remain effective even if project config or CLI flags request a looser policy. Global provider allowlists are intersected with project allowlists; an empty intersection is an error.

Schema: [src/config/schema.ts](../src/config/schema.ts). Main settings:

| Setting                                        | Default / behavior                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `routing.policy`                               | balanced; cheap, quality, local-only, privacy-first, custom also accepted                     |
| `routing.preferredModels`                      | Explicit `provider/model` preferences; custom policy uses these with normal eligibility rules |
| `privacy.cloudAllowed`                         | true                                                                                          |
| `privacy.localOnly`                            | false                                                                                         |
| `privacy.allowedProviders` / `deniedProviders` | Empty; denials win                                                                            |
| `privacy.paths`                                | Glob patterns using `*`, `**`, `?`; denial wins                                               |
| `budget.dailyUsd` / `taskUsd`                  | null (unset); hard ceilings require known per-model prices                                    |
| `budget.councilMaxModels`                      | 4; allowed range 2–8                                                                          |
| `execution.maxParallelModels`                  | 3; bounded council proposal execution                                                         |
| `execution.modelTimeout`                       | 60000 milliseconds                                                                            |
| `execution.toolTimeout`                        | 120000 milliseconds                                                                           |
| `execution.retries`                            | 2 per selected model                                                                          |
| `execution.repairLimit`                        | 2                                                                                             |
| `execution.maxToolRounds`                      | 12 per implementation/repair round                                                            |
| `execution.maxContextChars`                    | 40000 initial retrieval characters                                                            |
| `execution.maxOutputTokens`                    | 4096                                                                                          |
| `approvalMode`                                 | balanced; all modes retain explicit write/command grants and destructive-operation denial     |
| `verification`                                 | Optional user-configured verification commands, still constrained to the command allowlist    |
| `telemetry`                                    | true; local usage only, never sent to OmniStack servers                                       |

Costs depend on user-provided price metadata, provider token accounting and actual billable behavior. No model quality benchmarks are fabricated. Unknown prices remain unknown; hard budgets fail closed. Execution locking serializes invocations sharing one global home while allowing parallel council calls internally. No lock is broken automatically.

Read-only commands can inspect uninitialized repositories. Project memory lives only in that repository's `.omni/` and is retrieved as untrusted context. No global conversation memory exists.
