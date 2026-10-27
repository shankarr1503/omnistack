# Changelog

The skill library (the Claude Code plugin `omni`, also installed by `install.sh`) and the optional runtime (the `omni` CLI) are versioned separately. The plugin version lives in `library/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; the runtime version in `package.json`.

## Plugin 1.3.0 — unreleased

Token use:

- The 13 company-role descriptions, which Claude Code loads into every session, are one line each (at most 160 characters). Descriptions loaded per session went from about 2,190 to 1,570 tokens (-28%), measured with the new `scripts/context-cost.mjs`.
- Thirteen skills say how to read the large output they meet cheaply: the first error in a CI log, test summaries with the exit status, searches instead of directory reads, the changelog sections between two versions, the top of a profile. `skill-forge` asks new skills to do the same.
- `company` runs avoid reads and calls that buy nothing. Tickets carry their contracts and criteria, so engineers no longer read the spec, architecture, UX spec and threat model. The CTO writes codebase notes that later roles use instead of mapping the code again. Reviewers get the diff command in their prompt. Wave 0 runs only when it has something to build. The CFO's standing policy covers small plans without a call. QA reuses a suite result already recorded on the current snapshot. Every document has a line limit. These are designed savings; no new company benchmark has been run yet.
- CI fails if descriptions, skill bodies, role briefs or the playbook grow past their token ceilings.

Organization:

- One org chart that every brief agrees with: engineering (engineering manager, staff engineer, QA lead, release manager) reports to the CTO, senior and junior engineers to the engineering manager, the CEO's staff to the CEO, the board to the founder. Every role's report has a verdict, question or escalation line, and every document is saved where its producer is called. A test checks all of this against the chart.

## Plugin 1.2.0 — unreleased

Security:

- Every skill and company role now says which of its inputs (logs, CI output, pull requests, issues, changelogs, code comments, other roles' reports) are data, not instructions, and to mask secrets in reports. `company` treats only the founder's messages as instructions; `charter.md` and `decisions.md` cannot override a gate.
- `fix-ci` and `ship-review` run an untrusted change only in a container or VM without credentials. `upgrade-deps` checks new package names and the lockfile diff for typosquats and installs unfamiliar packages with scripts disabled first. `safe-migration` never runs destructive SQL or touches production without approval. `skill-forge` requires new skills to do the same and to hide nothing.
- The engineering manager role no longer has `Bash`.
- CI fails any skill or role containing invisible, bidirectional or Unicode tag characters, HTML comments, URLs, a download piped into a shell, a destructive command outside a prohibition, or a symlink, and any read-only role with `Bash` other than the CSO and CTO.
- `install.sh --ref <tag>` installs a reviewed release, and the installer prints the exact commit it cloned.

Behavior:

- `company` starts only when you run `/omni:company` or `/company` in Claude Code (`disable-model-invocation`), because a run costs 5-25x a single agent.
- `fix-ci` pushes only with the user's go-ahead.
- `prove-it` treats exported and public functions as having callers outside the repository: keep old call forms working or report a breaking change.
- `root-cause` hands CI-only failures to `fix-ci`, and `test-first` hands bugs with an unknown cause to `root-cause`, so "a test is failing" no longer matches three skills equally.
- Smaller fixes: `skill-forge` states the real limits (200 lines, 300-character descriptions, now enforced); the CFO's stop-loss rules point at the company skill's instead of repeating them; QA removes the worktree it creates and uses strict expected-failure markers; Phase 0 handles a repository with no commits.
- `bench/triggers`: an eval of whether each skill loads on its own from everyday wording, with near-misses.

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
- The `skills/omni-*` wrappers trigger only when the user asks OmniStack or omni for the work, and name the library skill that does it without a runtime; they no longer compete with the library skills for ordinary requests. A test keeps the uninstall list in sync with `skills/`.
- Budget estimates counted four tokens per character instead of roughly a quarter token, and calls the provider refused (401, 429, HTTP errors) were charged their full estimate to task and daily budgets. Refusals now cost nothing; timeouts, gateway timeouts (504, 524) and lost replies are still charged conservatively.
