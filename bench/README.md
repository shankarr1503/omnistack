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

| Task           | Without skill | With skill | What differed                                                                                   |
| -------------- | ------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| root-cause     | 75%           | **100%**   | Both conditions fixed the real cause. Only the skill runs added a regression test (2/2 vs 0/2). |
| test-first     | 75%           | **100%**   | All runs passed every hidden test. Only the skill runs wrote their own test suite (2/2 vs 0/2). |
| safe-migration | 100%          | 100%       | Both conditions produced a full expand/contract plan.                                           |
| ship-review    | 100%          | 100%       | Every run found all three planted bugs.                                                         |
| threat-check   | 100%          | 100%       | Every run found all five planted vulnerabilities.                                               |
| fix-ci         | 100%          | 100%       | Every run fixed the code instead of pinning the timezone.                                       |
| **All**        | **94%**       | **100%**   |                                                                                                 |

### What this shows

- On four of the six tasks the model already reached the ceiling without help, so these tasks cannot show a benefit. The skills did not make results worse.
- The measurable gains are in engineering habits rather than in finding the answer: with the skill, agents left behind regression tests and test suites every time; without it, they never did.
- Read the numbers as a first signal, not a result: two runs per condition, one model, small tasks.

### Next steps

- Harder tasks that separate the conditions: misleading symptoms, several interacting bugs, larger repositories and partial information.
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
