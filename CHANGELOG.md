# Changelog

## Unreleased

- Zero-setup skill library (`library/skills`): 16 standalone engineering skills for Claude Code, Codex and OpenCode, installable as a Claude Code plugin (`/plugin marketplace add shankarr1503/omnistack`) or with `install.sh`. CI validates every skill.
- Fixed: review diffs covered only the first 100 repository files; `edit_file` interpreted `$&`/`$$` in replacement text; non-normalised written paths were missing from review diffs.
- Common credential files (`.netrc`, `.npmrc`, `.pypirc`, `.docker/config.json`, keystores, Terraform state) are outside tool scope.

## 0.1.0 — unreleased

Initial standalone TypeScript runtime: global host skills, configuration and trust boundaries, provider adapters and discovery, model routing, councils, controlled implementation, verification and local recovery. Deterministic tests require no paid APIs. See docs/STATUS.md for release gates and limits.
