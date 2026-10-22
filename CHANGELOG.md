# Changelog

The skill library (the Claude Code plugin `omni`, also installed by `install.sh`) and the optional runtime (the `omni` CLI) are versioned separately. The plugin version lives in `library/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; the runtime version in `package.json`.

## Plugin 1.1.2 — unreleased

- `root-cause`: when the bug arrives with a failing test, also add a test that targets the cause, in the code being changed. That test usually checks only the symptom, so the cause stayed unguarded: in a benchmark run the agent fixed the right line but added no test for it. The report gains a `Test:` line, so a missing test is visible.

## Plugin 1.1.1 — unreleased

- `install.sh` no longer installs a second copy of every skill into Claude Code when the `omni` plugin is installed for the user and enabled (auto-detect mode only; `--claude` and `--project` still install).
- The README and the `company` skill name the command for each install method: `/omni:company` with the plugin, `/company` (Claude Code) or `$company` (Codex) with `install.sh`. Role descriptions say "company-skill runs" instead of naming only the plugin command.
- The README explains how to update the plugin. CI fails a pull request that changes `library/` without raising the plugin version, because installed plugins only update when the version goes up.

## Plugin 1.1.0 — 2026-10-09

- `company` skill: runs a request through an AI startup - CEO, board, CPO, CTO, design lead, CSO, CFO, engineering manager, staff/senior/junior engineers, QA lead and release manager. The engineering manager splits work into tickets with exclusive file ownership so engineers build in parallel waves; gates check test output against a baseline, review, security and QA evidence; nothing is pushed without the founder's approval. The 13 roles ship as Claude Code subagents (`omni:<role>` in the plugin, `omni-<role>` via `install.sh`) and as plain briefs for other hosts.
- `bench/tasks/company-tasks`: a feature task graded with hidden acceptance tests and a no-regression check, used to compare company mode with a single agent.

## Plugin 1.0.0 — 2026-10-09

- Zero-setup skill library (`library/skills`): 16 standalone engineering skills for Claude Code, Codex and OpenCode, installable as a Claude Code plugin (`/plugin marketplace add shankarr1503/omnistack`) or with `install.sh`. CI validates every skill.
- `bench/`: a benchmark that runs tasks with and without each skill and grades them with hidden tests.

## Runtime 0.1.0 — unreleased

Initial standalone TypeScript runtime: global host skills, configuration and trust boundaries, provider adapters and discovery, model routing, councils, controlled implementation, verification and local recovery. Deterministic tests require no paid APIs. See docs/STATUS.md for release gates and limits.

Fixed before release:

- `omni ship` reports a `status` and exits with code 2 when verification fails or the review has a critical or high finding (it used to exit 0 with no status).
- `omni run`, `omni debug`, `omni optimize` and their host wrappers work without `--allow-write`: they investigate with read-only tools and return a diagnosis instead of failing.
- Concurrent runs sharing one home queue (up to 10 minutes) instead of failing; SIGTERM and SIGHUP release the execution lock like Ctrl-C, and a lock left by a dead process, or left empty by a crash, is reclaimed automatically.
- Ctrl-C during the provider health check cancels at once; health checks time out after `execution.healthTimeout` (10 seconds by default) instead of the model timeout.
- Ctrl-C during a verification command reports the cancellation instead of a failed check, and on Linux and macOS sends SIGTERM to the command's whole process group (for example `npm test` and the test runner it started), not only to the direct child.
- `omni setup`, `dev-link` and `update` keep wrappers you edited (listed as `preserved`) instead of aborting, and setup and uninstall recognize OmniStack's own wrappers after `~/.omnistack` was deleted.
- Python verification uses the project's `.venv`/`venv` interpreter, `uv run --frozen pytest`, `python3` or `python`; a check whose command is missing or not allowed is reported as skipped, not failed.
- Connection failures name the network cause (for example ECONNREFUSED) instead of `TypeError`; provider 4xx/5xx errors include the provider's redacted error message, with the configured API key and any bearer token masked; "No eligible models" names each exclusion and its reason; requests to api.openai.com send `max_completion_tokens`.
- `omni review <path>` fails for a path that does not exist instead of reviewing the current directory; review instructions that mention a file (`omni review "focus on src/auth.ts"`) are still instructions.
- `omni update --apply` no longer installs `omnistack@latest` from npm: that name belongs to an unrelated package. Installs that are not a git checkout are refused until the runtime is published.
- Fixed: review diffs covered only the first 100 repository files; `edit_file` interpreted `$&`/`$$` in replacement text; non-normalised written paths were missing from review diffs.
- Common credential files (`.netrc`, `.npmrc`, `.pypirc`, `.docker/config.json`, keystores, Terraform state) are outside tool scope.
- Redaction no longer rewrites ordinary code (`token: string`, `secret = load()`) or lets `write_file` save `[REDACTED]` over real secrets: tool reads use per-run placeholders that writes and edits restore, quoted credentials are masked through their closing quote, and writes that would add an unrestorable placeholder are refused.
- Budget estimates counted four tokens per character instead of roughly a quarter token, and calls the provider refused (401, 429, HTTP errors) were charged their full estimate to task and daily budgets. Refusals now cost nothing; timeouts, gateway timeouts (504, 524) and lost replies are still charged conservatively.
