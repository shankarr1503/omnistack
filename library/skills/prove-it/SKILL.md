---
name: prove-it
description: Evidence before claims. Use before saying work is done, fixed, passing, working, or ready — and before committing, opening a PR, or handing off. Run the real checks, read their output, and report exactly what was verified and what was not.
---

# Prove it

"Done" is a claim. Every claim needs evidence you produced in this session. Plausible code, a successful edit, or a test that passed earlier is not evidence that the current state works.

## Before you say "done"

Run, in this order, whatever the project has (find the commands in `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml`, CI config, `CONTRIBUTING.md`):

1. **Build / compile / typecheck.**
2. **Lint and format check.**
3. **Tests** — the ones touching your change first, then the full suite if it is reasonably fast.
4. **The actual behavior.** Run the CLI, hit the endpoint, load the page, execute the script with the input from the task. Tests can pass while the feature is broken.

Read the output. Do not infer success from an exit code you did not see, a truncated log, or "no errors shown".

## Re-read your diff

`git diff` (and `git status` for untracked files). For each hunk ask:

- Is this change required by the task? Remove debugging output, commented-out code, stray files and unrelated reformatting.
- Did I handle the error/empty/edge case here, or only the happy path?
- Did I leave a TODO, placeholder, hard-coded value or `skip`/`only` in a test?
- Does every caller of a function I changed still work? Search for them.

## Report honestly

Use exactly these categories:

```
Verified:      <check> — <command> — <result>        (things you ran and saw pass)
Not verified:  <check> — <why: no access, too slow, needs credentials, flaky env>
Known issues:  <failures, warnings, limitations you saw>
```

- A failing check is reported as failing, with the relevant output — even if you believe it is unrelated. Say why you believe that.
- "Should work", "probably", "I believe this fixes" are not allowed in place of evidence. If you could not verify, say "not verified".
- Never suppress a failure to get green: no deleting tests, `|| true`, `@ts-ignore`, `eslint-disable`, `pytest.skip`, `--no-verify` or lowered thresholds unless the user explicitly asked for that.

## When a check fails

Do not declare victory with caveats. Fix it, or stop and report precisely what fails and what you tried. Partial work honestly labelled beats complete-looking work that is broken.
