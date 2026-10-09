# Changelog

## Unreleased

- `company` skill (`/omni:company`): runs a request through an AI startup - CEO, board, CPO, CTO, design lead, CSO, CFO, engineering manager, staff/senior/junior engineers, QA lead and release manager. The engineering manager splits work into tickets with exclusive file ownership so engineers build in parallel waves; gates check test output, review, security and QA evidence; nothing is pushed without the founder's approval. The 13 roles ship as Claude Code subagents (`omni:<role>` in the plugin, `omni-<role>` via `install.sh`) and as plain briefs for other hosts.
- `bench/tasks/company-tasks`: a feature task graded with hidden acceptance tests, used to compare company mode with a single agent.
- Zero-setup skill library (`library/skills`): 16 standalone engineering skills for Claude Code, Codex and OpenCode, installable as a Claude Code plugin (`/plugin marketplace add shankarr1503/omnistack`) or with `install.sh`. CI validates every skill.
- Fixed: review diffs covered only the first 100 repository files; `edit_file` interpreted `$&`/`$$` in replacement text; non-normalised written paths were missing from review diffs.
- Common credential files (`.netrc`, `.npmrc`, `.pypirc`, `.docker/config.json`, keystores, Terraform state) are outside tool scope.

## 0.1.0 — unreleased

Initial standalone TypeScript runtime: global host skills, configuration and trust boundaries, provider adapters and discovery, model routing, councils, controlled implementation, verification and local recovery. Deterministic tests require no paid APIs. See docs/STATUS.md for release gates and limits.
