---
name: upgrade-deps
description: Upgrade dependencies, frameworks or language versions safely. Use when bumping packages, fixing vulnerable dependencies, moving to a new major version, or modernising a runtime. Reads changelogs, upgrades in small batches, and verifies each step.
---

# Upgrade deps

Most upgrade pain comes from bumping everything at once and then not knowing which change broke what.

## 1. Inventory

- List what is outdated and why it matters: `npm outdated`, `pip list --outdated`, `cargo outdated`, `go list -m -u all`, `bundle outdated`.
- Run the security audit (`npm audit`, `pip-audit`, `cargo audit`, `govulncheck`). Security fixes go first.
- Make sure the test suite is green **before** you start, so new failures are attributable.

## 2. Read before you bump

For each major version change, read the changelog, release notes and migration guide between the current and target version. Note: removed/renamed APIs, changed defaults, new peer-dependency or runtime requirements, and behavior changes that will not cause a compile error. Search the codebase for every API mentioned.

## 3. Upgrade in small batches

- Order: patch/minor updates together first (low risk), then each major version separately, then the framework/runtime.
- For large jumps (e.g. 2 → 5), go one major at a time if the migration guide is written that way.
- Use official codemods/migration tools where they exist, then review their changes.
- Update the lockfile with the package manager, never by hand. Commit manifest + lockfile together.
- After each batch: install from clean, build, typecheck, lint, test, and run the app's key flows. Commit when green.

## 4. When something breaks

- Find which package caused it (bisect the batch if needed).
- Fix the call site per the migration guide. Don't pin to an old transitive version or add overrides/resolutions without noting why and when to remove them.
- If an upgrade is blocked (incompatible peer, needs a larger refactor), leave it at the highest working version and report the blocker.

## 5. Report

A table of `package: old → new`, notable breaking changes handled, verification run per batch, anything deferred with the reason, and remaining audit findings.
