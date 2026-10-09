---
name: commit-craft
description: Write clean commits and pull request descriptions that reviewers love. Use when committing, splitting work into commits, writing a commit message, opening or describing a pull request, or writing release notes. Follows the repository's conventions first.
---

# Commit craft

History is documentation that never goes stale. A good commit explains **why**; the diff already shows what.

## Before committing

- `git status` and `git diff --staged`. Stage only what belongs to this change. No debug prints, secrets, `.env`, build output, editor files or unrelated formatting.
- One logical change per commit. A refactor, a bug fix and a feature are three commits. Each commit should build and pass tests on its own.
- Check the repo's convention first: `git log --oneline -20`, `CONTRIBUTING.md`, commitlint config. If it uses Conventional Commits (`feat:`, `fix:`), or ticket prefixes, follow it exactly.

## Commit message

```
<Imperative summary, ≤ 72 chars, no trailing period>

<Why this change is needed: the problem, the context, the constraint.
How it addresses it, when that is not obvious from the diff.
Notable side effects, trade-offs or follow-ups.>

<Trailers: Fixes #123, Co-authored-by: ..., BREAKING CHANGE: ...>
```

- Summary completes "If applied, this commit will …": _Add retry to webhook delivery_, not _Added retries_ or _webhook stuff_.
- Wrap the body at ~72 characters. Explain the reasoning a reviewer in two years will need.
- Never `fix`, `wip`, `updates`, `misc` as the whole message.

## Pull request description

```
## What
<1–3 sentences: the change, in user/system terms>

## Why
<the problem or goal; link the issue>

## How
<approach and key decisions; alternatives rejected and why>

## Testing
<what you ran and the results; how a reviewer can verify>

## Risk & rollout
<blast radius, migrations, flags, backward compatibility, rollback plan>
```

- Use the repository's PR template if it has one — fill in its sections instead of this layout.
- Keep PRs small enough to review in one sitting (roughly < 400 changed lines). Split otherwise.
- Point reviewers at the tricky parts. Include screenshots or before/after output for UI or CLI changes.
- Never claim testing you did not do.

## Safety

- Never rewrite published history (`rebase`, `--amend`, `push --force`) on a shared branch without the owner's agreement. Prefer `--force-with-lease` on your own branches.
- Never bypass hooks (`--no-verify`) to get a commit through; fix what the hook reports.
