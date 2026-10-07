---
name: fix-ci
description: Diagnose and fix a failing CI pipeline, build or test job. Use when GitHub Actions, GitLab CI, Jenkins or any pipeline is red, or when tests pass locally but fail in CI. Reads the actual logs, reproduces locally, and fixes the cause instead of retrying or skipping.
---

# Fix CI

Red CI is information. "Flaky" is a hypothesis, not a diagnosis.

## 1. Read the real failure

- Open the failing job's log and find the **first** error, not the last line. Later errors are usually fallout.
- Note: job name, OS/runtime versions, the exact command, the error text, and the commit SHA.
- Check whether the same job fails on the base branch. If it does, the failure is not caused by this change — say so, and look for an existing fix to port.

## 2. Classify

| Symptom                     | Usual cause                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passes locally, fails in CI | different runtime/OS version, missing env var or secret, case-sensitive paths, timezone/locale, clean checkout missing a generated or ignored file, dependency resolved to a newer version |
| Fails only sometimes        | test order dependence, shared state, real time/network, race, port collision, insufficient wait                                                                                            |
| Lint/format/typecheck       | tool version difference; config not picked up; real issue                                                                                                                                  |
| Install/dependency step     | lockfile out of sync, registry outage, removed version, native build toolchain                                                                                                             |
| Timeout / killed            | infinite loop, hanging network call, waiting on input, OOM                                                                                                                                 |

## 3. Reproduce locally

Match CI as closely as possible: same runtime version, clean install (`npm ci`, `pip install -r` in a fresh venv, `cargo build --locked`), same command, same env vars (`CI=true`), same test order/seed. For OS-specific failures, use a container matching the runner. A failure you can reproduce is a failure you can fix.

## 4. Fix the cause

- Fix code, test, or config — whichever is actually wrong. Use the `root-cause` skill if the cause is not obvious.
- For flaky tests: remove the nondeterminism (inject the clock, await the condition instead of sleeping, isolate state, use random ports). Prove it by looping the test many times.
- Never: skip/disable/quarantine the test, add `|| true`, mark it `continue-on-error`, raise timeouts blindly, or re-run until green. Those hide the bug from everyone after you.

## 5. Verify and report

Run the failing command locally after the fix and show the result. Push and confirm the CI job passes on the new commit. Report: failing job, root cause, fix, evidence.
