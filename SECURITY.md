# Security policy

This initial release has not had an independent external security audit. Supported fixes target the current development version until a versioned release policy exists.

## Reporting

Report vulnerabilities privately at https://github.com/shankarr1503/omnistack/security/advisories/new. Do not open public issues with live credentials or exploit details.

## Skill library and plugin

The skills and the `company` role subagents are instructions to your coding agent. They run with your agent's own permissions: in Claude Code, whatever tools and permission mode you have allowed. The engineer, QA and release roles can edit files and run shell commands. The board, CEO, CFO, CPO and design lead have only read and search tools. The CTO, CSO and engineering manager have no edit tools but do have the shell; they are told to run only read-only commands, and nothing enforces that. Rules such as "never push without the founder's approval" or "change only the files your ticket owns" are instructions the model follows, not limits the tools enforce. Review what a run changed before you commit it, keep your permission settings as strict as you need, and use a container or VM for repositories you do not trust. Repository content (code, docs, issues) can try to steer the agent through prompt injection.

## Trust boundaries (runtime)

Model tool calls and repository text are untrusted. Model providers never receive direct shell access. Central tools validate arguments, resolve paths, reject traversal, secrets directories, symbolic links/junctions and hard links, and check write hashes. Privacy checks apply before routing and during tool reads. Project config cannot select credential destinations or grant execution permission.

All destructive shell commands are denied by the model tool surface. There is no model-accessible push, deploy, publish, reset-hard, branch deletion, arbitrary shell, environment dump or dependency-install tool. Explicit runtime maintenance commands are separate CLI actions.

## Provider errors

When a provider rejects a request, OmniStack shows only the structured error message from its JSON body, after redaction, on one line and capped at 300 characters. Raw text and HTML bodies are never echoed.

## Repository commands

`--allow-commands` authorizes execution of supported repository checks. Tests, compiler plugins and lint configuration can execute arbitrary code. An allowlist **does not sandbox that code**. The child environment omits API-key variables, but scripts still run as the developer and may access their filesystem. For hostile repositories use an OS/container sandbox with restricted credentials and network access. Do not infer safety from a command being named `test`. The allowlist includes the repository's own `.venv`/`venv` Python interpreter and `uv run --frozen pytest`, which run at the same trust level as its tests; `uv run` may create `.venv` and download the locked dependencies.

**Combining `--allow-write` with `--allow-commands` lets the model run code it wrote.** The model can edit a test file, `package.json` script, `conftest.py` or build script, then run the allowlisted check that executes it. The command allowlist limits which commands can be named; it does not limit what code they run. Repository text can steer the model through prompt injection, so only grant both flags together on repositories you trust, or inside a container/VM.

Timeouts are bounded but complete descendant-process termination is not guaranteed on every OS. Filesystem preflight and optimistic hashes reduce accidental overwrite; they are not a defense against an adversary racing filesystem changes with the same OS privileges.

## Secrets, privacy and persistence

Provider credentials come from named environment variables. They are not copied into config or logs. Endpoints cannot contain credentials, query strings or fragments, remote endpoints require HTTPS, and redirects are rejected. Provider fallback resolves each provider's own credentials.

Heuristic redaction catches common tokens, private keys and secret assignments. Arbitrary business-sensitive source is not automatically recognizable. Set path privacy, provider restrictions or `cloudAllowed: false` before running workflows.

Recovery journals contain source preimages, never intentionally uploaded. They live in user-local state with restrictive POSIX modes; Windows ACLs inherit from the chosen home directory. Protect and prune them according to your source retention requirements. Usage metrics contain hashed repository identity, model IDs, token counts and status, not full prompts. No metrics are sent to a central service.

Install/uninstall use ownership hashes and preserve edited wrappers. Package-manager removal is separate from registration removal. They never recursively delete target repositories or unrelated host configuration.
