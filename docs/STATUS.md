# Implementation status and release gates

## Working

- Strict TypeScript, npm executable and reusable exports; isolated source/global/target concepts.
- Config precedence, trusted-field validation, secret environment references, global privacy restrictions.
- Three generated global host integrations and twelve canonical workflows.
- Setup, optional init, doctor, uninstall registrations, dev link/unlink, update preview/application.
- OpenAI-compatible and Anthropic adapters, discovery cache, catalog health, deterministic mocks.
- Classifier, replaceable router, role definitions, FAST/TEAM/COUNCIL engine, bounded retries/cancellation/fallback.
- Validated proposals, anonymous critic/synthesis, provider diversity, deduplication and degraded consensus reporting.
- Git-aware bounded retrieval, central filesystem tools, optimistic write checks, local recovery journals.
- Verification of authorized repository commands, independent review and repair; no inferred test success.
- DAG executor and worktree SDK with dirty-worktree preservation.
- Local usage ledger, cost reservations and cross-process execution locking.
- Extension interfaces for providers, routers, agents, tools, validators and MCP bridges.

## Remaining release gates

This is a substantial initial implementation, not a declaration that every item in the product vision is complete.

- Independent GitHub repository at https://github.com/shankarr1503/omnistack. The runtime is not published to npm, and the unscoped npm name `omnistack` belongs to an unrelated package, so publishing needs a different (for example scoped) name.
- CI runs typecheck, lint, the full test suite, build and `npm pack` on Ubuntu, macOS and Windows with Node 22 and 24, and is green on main. The skill library and plugin have been exercised in real Claude Code sessions (see bench/README.md). The runtime's interactive host sessions and live API inference against real providers have not been exercised.
- Native Google/AWS/Azure identity adapters, wire streaming and complete multimodal content are future work.
- Research uses repository context and model knowledge; live browser/MCP research requires an embedding integration.
- DAG and worktree facilities are reusable SDK components; the default implementation worker edits serially. Automatic concurrent worktree integration is not enabled.
- Retrieval ranks paths/instruction files, then caps context. Full AST/LSP/dependency graphs and large-monorepo indexing remain future work.
- Installer updates preserve unrelated files but are not a single multi-file filesystem transaction. A power loss during registration may require inspection of the manifest and generated wrapper.
- The command controller is an authorization layer, not an OS sandbox. Repository scripts can run arbitrary code once approved. Subprocess tree termination and adversarial concurrent filesystem mutation need stronger platform isolation before hostile-repository certification.
- Glob privacy and heuristic redaction cannot prove that public files contain no copied secrets or sensitive data. Models' prose can still reveal self-identities beyond known identity tokens.
- Local budgets are conservative estimates based on configured prices. Provider billing remains authoritative; vendor-specific hidden/cached tokens and third-party extensions need additional accounting tests.
- Uninstall removes owned registrations; npm removes its own package. Checkout/user data removal is deliberately manual.
- Parallel executions sharing one global home are serialized to protect budget accounting. Remote/distributed ledgers are not implemented.

## Highest-priority next work

Run interactive host smoke tests, exercise real provider fixtures for account-specific models, add process-tree/container isolation, then complete durable installer transactions and production release signing. See SECURITY.md before executing untrusted repository scripts.
