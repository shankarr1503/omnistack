# Contributing

## Adding a library skill (most contributions)

Skills in `library/skills/` are standalone Markdown and need no runtime. To propose one:

1. Create `library/skills/<kebab-name>/SKILL.md` with only `name` (matching the folder) and `description` frontmatter. The description must say what the skill does and when to use it ("Use when ...").
2. Follow the bar in the README: it must change agent behavior, be concrete, end with an evidence-based report, be safe by default, and stay under 200 lines. The `skill-forge` skill walks through this.
3. Try it on 3–5 real prompts in at least one host, and describe those runs in your pull request (what you asked, what the agent did with and without the skill).
4. Add it to the skills table in `README.md` and run `npm test`; `tests/library.test.ts` validates every skill.

Improvements to existing skills are welcome. Show a case where the current skill led the agent astray.

## Runtime development

Requires Node.js 22+ and Git. Install dependencies with `npm ci`, then run `npm run check` (typecheck, lint, tests and build). Tests use temporary repositories and mock providers; paid API keys are not required. Windows PowerShell users can use `npm.cmd`.

After building, `npm link` exposes the CLI. `omni dev-link` installs global host wrappers pointing at your checkout. Rebuild after changing TypeScript; use `omni dev-unlink` to remove owned wrappers. Test application edits in a separate repository, never in the runtime installation.

Architecture boundaries:

- `config`, `hosts`, `skills`, `cli`: installation and invocation.
- `providers`, `registry`, `router`, `privacy`: model eligibility and protocol translation.
- `agents`, `council`, `core`: orchestration and structured results.
- `repository`, `permissions`, `tools`, `worktrees`: explicitly scoped target operations.
- `telemetry`: local usage and budget evidence.

Adding a provider: implement `ModelProvider`, normalize errors/usage, resolve secrets outside prompts, register it explicitly, and add deterministic protocol fixtures. Prefer an existing compatibility family over vendor-specific duplication. Never guess capability or pricing claims.

Adding a runtime skill: add one canonical `skills/omni-NAME/SKILL.md`, validate name/description, connect its workflow command, extend the managed uninstall allowlist, and exercise generated wrappers for all hosts. Skill logic belongs in runtime modules, not three independent prompts.

Adding a host: implement its directory/detection adapter, verify official discovery behavior, render from canonical skills, and extend lifecycle fixtures. Preserve all unrelated files and modified generated content.

Style: strict TypeScript, no `any`, explicit target roots, no shell interpolation from model arguments, validated untrusted inputs, concise typed errors. Add meaningful security/failure tests for boundaries you change. Do not weaken tests to accept incorrect behavior.

Use focused changes and describe behavior, validation and remaining limitations. Do not commit keys, source checkpoints, generated global state or prompts. MIT licensing applies to original contributions; retain notices for intentional third-party reuse.
