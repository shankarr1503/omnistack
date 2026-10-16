# Changelog

The skill library (the Claude Code plugin `omni`, also installed by `install.sh`) and the optional runtime (the `omni` CLI) are versioned separately. The plugin version lives in `library/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; the runtime version in `package.json`.

## Plugin 1.1.1 — unreleased

- `install.sh` no longer installs a second copy of every skill into Claude Code when the `omni` plugin is already installed (auto-detect mode only; `--claude` still installs).
- The README and the `company` skill name the command for each install method: `/omni:company` with the plugin, `/company` (Claude Code) or `$company` (Codex) with `install.sh`. Role descriptions say "company-skill runs" instead of naming only the plugin command.
- The README explains how to update the plugin. CI fails a pull request that changes `library/` without raising the plugin version, because installed plugins only update when the version goes up.

## Plugin 1.1.0 — 2026-10-09

- `company` skill: runs a request through an AI startup - CEO, board, CPO, CTO, design lead, CSO, CFO, engineering manager, staff/senior/junior engineers, QA lead and release manager. The engineering manager splits work into tickets with exclusive file ownership so engineers build in parallel waves; gates check test output against a baseline, review, security and QA evidence; nothing is pushed without the founder's approval. The 13 roles ship as Claude Code subagents (`omni:<role>` in the plugin, `omni-<role>` via `install.sh`) and as plain briefs for other hosts.
- `bench/tasks/company-tasks`: a feature task graded with hidden acceptance tests and a no-regression check, used to compare company mode with a single agent.

## Plugin 1.0.0 — 2026-10-09

- Zero-setup skill library (`library/skills`): 16 standalone engineering skills for Claude Code, Codex and OpenCode, installable as a Claude Code plugin (`/plugin marketplace add shankarr1503/omnistack`) or with `install.sh`. CI validates every skill.
- `bench/`: a benchmark that runs tasks with and without each skill and grades them with hidden tests.

## Runtime — unreleased

- Fixed: review diffs covered only the first 100 repository files; `edit_file` interpreted `$&`/`$$` in replacement text; non-normalised written paths were missing from review diffs.
- Common credential files (`.netrc`, `.npmrc`, `.pypirc`, `.docker/config.json`, keystores, Terraform state) are outside tool scope.

## Runtime 0.1.0 — unreleased

Initial standalone TypeScript runtime: global host skills, configuration and trust boundaries, provider adapters and discovery, model routing, councils, controlled implementation, verification and local recovery. Deterministic tests require no paid APIs. See docs/STATUS.md for release gates and limits.
