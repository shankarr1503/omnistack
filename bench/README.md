# Skill benchmark

Does an agent do better work with a skill loaded? This benchmark runs the same realistic task with and without the matching skill and scores the result with hidden tests and checks the agent never sees.

## Tasks

| Task             | What the agent is asked                                        | What is graded                                                                                                                |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `root-cause`     | Fix a crash in `formatSummary` (the real bug is in the parser) | Hidden tests that a symptom-only patch fails; visible test not weakened; regression test added                                |
| `test-first`     | Implement `parseDuration` from a written spec                  | 21 hidden edge-case tests; the agent wrote and passes its own test suite                                                      |
| `ship-review`    | Review a branch before merge                                   | Finds the null-contract break in an unchanged caller, the SQL injection and the dropped `await`; verdict is not "ship"        |
| `threat-check`   | Security review of a small billing service                     | Finds IDOR, path traversal, SSRF, `Math.random` tokens and plaintext passwords                                                |
| `safe-migration` | Rename a column on a 40M-row live Postgres table               | Expand/contract instead of `RENAME COLUMN`, batched and concurrency-safe backfill, dual writes, deferred drop, `lock_timeout` |
| `fix-ci`         | CI is red, tests pass locally (timezone bug)                   | Hidden tests pass in UTC, Berlin, Los Angeles and Kolkata; tests not weakened; no `TZ` pinning workaround                     |

Every grader was checked against three inputs before any agent ran: the untouched fixture (scores low), a shortcut fix such as a null check or `TZ=UTC` (scores low) and a reference fix (scores full).

## Results

12 runs without the skill and 12 with it: 6 tasks, 2 runs each. All runs used the same model with the same prompt; "with skill" runs were told to read the matching `SKILL.md` first. One run (`safe-migration`, with skill) was cut off by a usage limit and re-run from a fresh copy; the partial attempt was discarded.

| Task           | Without skill | With skill | What differed                                                                                                       |
| -------------- | ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| root-cause     | 75%           | **100%**   | Both conditions fixed the real cause. Only the skill runs added a regression test (2/2 vs 0/2).                     |
| test-first     | 75%           | **100%**   | All runs passed every hidden test. Skill runs wrote 20 and 24 tests; runs without it wrote 6 and 7 (the bar was 8). |
| safe-migration | 100%          | 100%       | Both conditions produced a full expand/contract plan.                                                               |
| ship-review    | 100%          | 100%       | Every run found all three planted bugs.                                                                             |
| threat-check   | 100%          | 100%       | Every run found all five planted vulnerabilities.                                                                   |
| fix-ci         | 100%          | 100%       | Every run fixed the code instead of pinning the timezone.                                                           |
| **All**        | **94%**       | **100%**   |                                                                                                                     |

### What this shows

- On four of the six tasks the model already reached the ceiling without help, so these tasks cannot show a benefit. The skills did not make results worse.
- The measurable gains are in engineering habits rather than in finding the answer: with the skill, debugging runs always added a regression test (without it, none did), and test-first runs wrote about three times as many tests.
- Read the numbers as a first signal, not a result: two runs per condition, one model, small tasks.

## Round 2: harder tasks

Six tasks built so the obvious fix is wrong, run the same way (2 runs per condition). Each grader was again checked against the untouched fixture, a plausible shortcut and a reference fix.

| Task                | Trap                                                                                                                                        | Skill           | Without skill | With skill |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------- | ---------- |
| `rc-shared-state`   | Wrong tie-break; an alphabetical sort passes the visible test, but the cause is another module sorting a shared array in place              | `root-cause`    | 75%           | **100%**   |
| `prove-callers`     | Adding a currency argument collides with an existing `decimals` argument; only the integration suite and other callers reveal it            | `prove-it`      | 100%          | 88%        |
| `perf-red-herring`  | The user blames a regex; the cost is an O(n²) dedupe in another file                                                                        | `perf-hunt`     | 100%          | 100%       |
| `refactor-quirks`   | Refactor a messy pricing function without changing any of its odd rounding or code rules (compared with the original on 2,000 random carts) | `safe-refactor` | 100%          | 100%       |
| `review-subtle`     | A "cleanup" PR hiding a pagination off-by-one, a cross-tenant cache key and a signup race                                                   | `ship-review`   | 100%          | 100%       |
| `ci-flaky-rounding` | A "flaky" test that is a real rounding bug; pinning the random seed hides it                                                                | `fix-ci`        | 100%          | 100%       |
| **All**             |                                                                                                                                             |                 | **96%**       | **98%**    |

What happened:

- Every run, with or without the skill, found the real cause: the in-place sort, the O(n²) dedupe (not the regex the user blamed), the rounding bug behind the "flaky" test, and all three planted review bugs. All eight refactors kept every output identical. The traps did not catch this model.
- The one consistent difference is the same as round 1: on the debugging task only the skill runs left a regression test behind (2/2 vs 0/2).
- One skill run scored lower: on `prove-callers` it updated the in-repo callers but made the old `formatPrice(amount, decimals)` form throw, which would break callers outside the repository. The other three runs kept the old form working. One run is not evidence that the skill causes this, but it is reported as measured.
- The `prove-callers` fixture shipped with broken `npm test` scripts (`node --test test/unit` fails on Node 22). All four runs noticed and ran the test files directly, so grading was unaffected. The scripts are fixed for future runs.

## Overall (48 runs)

Across both rounds, runs without a skill scored 95% and runs with one scored 99%. For this model, the skills did not change whether the agent found the answer; it nearly always did. They changed what it left behind:

- On the two debugging tasks, every run with the skill added a regression test for the cause (4/4); no run without it did (0/4).
- On the test-first task, runs with the skill wrote 20 and 24 tests; runs without it wrote 6 and 7.

The benchmark has not yet been run with other or weaker models, where instructions may matter more.

### Next steps

- Tasks large enough that the agent cannot read everything: real repositories, many files, partial information.
- More runs per condition, and weaker or older models, where instructions are likely to matter more.
- A triggering test: whether the right skill loads on its own from the user's wording, instead of being named in the prompt.

## Running it

```sh
node bench/setup.mjs root-cause /tmp/runs/root-cause-base-1    # one fresh repo per run
# ... run an agent in that directory with bench/tasks/root-cause/prompt.md
#     (for a "skill" run, also tell it to read library/skills/root-cause/SKILL.md)
node bench/grade.mjs root-cause /tmp/runs/root-cause-base-1    # JSON score for one run
node bench/report.mjs /tmp/runs                                # table over <task>-<base|skill>-<n> dirs
```

Keep run directories outside this repository so agents cannot read the hidden tests in `bench/tasks/*/hidden` or `expected.json`. Agents that cannot write files should return their final report as text; save it as `REPORT.md` in the run directory before grading.
