---
name: ship-review
description: Rigorous pre-merge review of a diff, branch or pull request. Use when asked to review code, check a PR, or decide whether a change is safe to merge. Finds real bugs with evidence and a severity, not style opinions.
---

# Ship review

The job is to find what will break in production, prove it, and rank it — not to restate the diff or bikeshed style.

## 1. Get the full change

- Branch: `git diff <base>...HEAD` and `git log <base>..HEAD`. Working tree: `git diff HEAD` plus `git status` for untracked files. PR: the PR diff and description.
- Read the intent: PR description, linked issue, commit messages. You are checking the code against what it claims to do.
- For each changed function, open the **whole file** and the **callers** (search for usages). Most real bugs live in the interaction between changed and unchanged code.

## 2. Hunt, in this order

1. **Correctness.** Wrong condition or off-by-one; inverted boolean; missing `await`; unhandled `null`/empty/zero; wrong units or timezone; integer overflow; mutation of shared state; changed function contract that some caller still relies on; error swallowed or turned into success.
2. **Security.** Untrusted input reaching SQL, shell, file paths, HTML, templates, deserialisers, URLs (SSRF) or redirects; missing authorization check on a new endpoint; secrets in code or logs; weakened validation.
3. **Data and state.** Migrations that lock or rewrite large tables; non-backward-compatible schema or message changes during rolling deploys; missing transaction; partial failure leaving inconsistent state; cache invalidation.
4. **Concurrency and reliability.** Races, check-then-act, missing timeouts/retries on network calls, retries on non-idempotent operations, resource leaks (files, connections, listeners, goroutines).
5. **Performance.** N+1 queries, unbounded loops/queries/memory on user-controlled sizes, work moved into a hot path.
6. **Tests.** Does a test fail if the change is reverted? Are the new branches and error paths covered? Were assertions weakened?

## 3. Prove every finding

For each candidate, trace a concrete path: _this input/state → this line → this wrong result_. If you cannot describe the failing scenario, it is not a finding — drop it or list it as a question. Run the code or a test when you can.

## 4. Rank

- **Blocker** — will cause incorrect results, data loss, security exposure or outage in a realistic scenario.
- **Major** — likely bug or missing handling with real impact, but narrower.
- **Minor** — correctness nit, misleading name, missing test for a rare path.
- **Nit** — optional. Keep these few; omit pure taste.

## Output

```
Verdict: ship | ship after fixes | do not ship

[Blocker] path/file.ts:42 — <one-line claim>
  Scenario: <input/state that triggers it>
  Impact:   <what goes wrong>
  Fix:      <concrete suggestion>
...
Questions: <things you could not determine>
Checked and fine: <areas reviewed with no issues, one line each>
```

No findings is a valid result — say what you checked. Do not pad with low-value comments to look thorough.
