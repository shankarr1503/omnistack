---
name: root-cause
description: Find the real cause of a bug before changing code. Use when something fails, crashes, returns wrong results, is flaky, or "worked before" — and before proposing any fix. Reproduce, isolate, prove the cause, then fix once.
---

# Root cause

A fix without a proven cause is a guess. Guesses pass review, then the bug comes back. Follow these phases in order. Do not edit production code until phase 3 is done.

## 1. Reproduce

- Get the exact failure: full error, stack trace, failing command, input, environment, version/commit.
- Run it yourself. Record the command and the output verbatim.
- If you cannot reproduce it, say so and gather more evidence (logs, the reporter's exact steps, environment differences). Do not "fix" what you cannot observe.
- Shrink it: the smallest input, test or script that still fails. A 5-line repro is worth an hour of reading.

## 2. Isolate

Narrow where the fault lives using evidence, not intuition:

- **Read the error literally.** The file, line and message usually say more than people credit. Read the code at that line and its callers.
- **Diff against a known-good state.** `git log -p -- <file>`, `git diff <good>..<bad>`. If it "worked before", run `git bisect run <repro-command>`; it is mechanical and fast.
- **Bisect the data path.** Log or assert the value at the midpoint between the input (known good) and the output (known bad). Repeat until two adjacent steps disagree.
- **Change one variable at a time.** Environment, input, dependency version, config flag.

## 3. Prove the cause

Write down, in one or two sentences: _"X happens because Y, at file:line."_ Then prove it with something you ran:

- Explain every symptom, not just the main one. If a symptom is unexplained, the cause is incomplete.
- Predict: "if this is the cause, then changing Z will make the failure disappear/appear." Run that.
- Hypotheses you ruled out are worth one line each so nobody re-checks them.

## 4. Fix

- Write a failing test that captures the bug **first** (it must fail for the right reason).
- Fix the cause, not the symptom. Wrapping the crash in `try/catch`, adding a null check where the value should never be null, retrying a deterministic failure, or bumping a timeout are symptom fixes — reject them unless you can justify why the symptom _is_ the bug.
- Keep the fix minimal. Refactors go in a separate change.
- Look for siblings: grep for the same pattern elsewhere. The same mistake is usually made more than once.

## 5. Confirm

- The new test passes; the original repro no longer fails; the surrounding test suite still passes. Show the commands and results.
- For flaky failures: run the test many times (e.g. 50–200 loops) before and after. One green run proves nothing.

## Stop and ask when

- Three fix attempts have failed — your model of the system is wrong. Go back to phase 2 and question an assumption you have not verified.
- The cause is in a dependency, infrastructure, or code you were not asked to touch. Report the evidence and a proposed patch instead of working around it silently.

## Report

```
Symptom:   <what failed, with the exact error>
Repro:     <command>
Cause:     <one or two sentences, file:line>
Evidence:  <what you ran that proves it>
Fix:       <what changed and why it addresses the cause>
Verified:  <tests/commands run and their results>
Ruled out: <hypotheses eliminated>
```

Never say "this should fix it". Say what you ran and what it showed.
