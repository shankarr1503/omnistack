# Security policy

This initial release has not had an independent external security audit. Supported fixes target the current development version until a versioned release policy exists.

## Reporting

Once hosted on GitHub, use the repository's private vulnerability reporting facility if enabled. Until a private reporting channel is published, do not post live credentials or exploitable deployment details publicly. A private maintainer contact must be established before public production release.

## Trust boundaries

Model tool calls and repository text are untrusted. Model providers never receive direct shell access. Central tools validate arguments, resolve paths, reject traversal, secrets directories, symbolic links/junctions and hard links, and check write hashes. Privacy checks apply before routing and during tool reads. Project config cannot select credential destinations or grant execution permission.

All destructive shell commands are denied by the model tool surface. There is no model-accessible push, deploy, publish, reset-hard, branch deletion, arbitrary shell, environment dump or dependency-install tool. Explicit runtime maintenance commands are separate CLI actions.

## Repository commands

`--allow-commands` authorizes execution of supported repository checks. Tests, compiler plugins and lint configuration can execute arbitrary code. An allowlist **does not sandbox that code**. The child environment omits API-key variables, but scripts still run as the developer and may access their filesystem. For hostile repositories use an OS/container sandbox with restricted credentials and network access. Do not infer safety from a command being named `test`.

Timeouts are bounded but complete descendant-process termination is not guaranteed on every OS. Filesystem preflight and optimistic hashes reduce accidental overwrite; they are not a defense against an adversary racing filesystem changes with the same OS privileges.

## Secrets, privacy and persistence

Provider credentials come from named environment variables. They are not copied into config or logs. Endpoints cannot contain credentials, query strings or fragments, remote endpoints require HTTPS, and redirects are rejected. Provider fallback resolves each provider's own credentials.

Heuristic redaction catches common tokens, private keys and secret assignments. Arbitrary business-sensitive source is not automatically recognizable. Set path privacy, provider restrictions or `cloudAllowed: false` before running workflows.

Recovery journals contain source preimages, never intentionally uploaded. They live in user-local state with restrictive POSIX modes; Windows ACLs inherit from the chosen home directory. Protect and prune them according to your source retention requirements. Usage metrics contain hashed repository identity, model IDs, token counts and status, not full prompts. No metrics are sent to a central service.

Install/uninstall use ownership hashes and preserve edited wrappers. Package-manager removal is separate from registration removal. They never recursively delete target repositories or unrelated host configuration.
