# Company playbook

Reference formats for the `company` skill. The chief of staff (the main agent) owns every file here; roles return text and the chief of staff saves it.

## Files

```
.omni/company/
├── charter.md                 # optional, written once by the founder: mission, users, constraints
├── decisions.md               # append-only log of decisions and lessons across runs
└── 2026-10-09-habit-tracker/  # one folder per run: <date>-<slug>
    ├── STATUS.md              # live status board (below)
    ├── 01-vision.md           # ceo
    ├── 02-spec.md             # cpo
    ├── 03-architecture.md     # cto
    ├── 03-ux.md               # design-lead (if used)
    ├── 03-threat-model.md     # cso, mode 1 (if used)
    ├── 04-tickets.md          # eng-manager (a re-plan gives new ids, e.g. T2b, and marks the old ticket superseded)
    ├── 04-budget.md           # cfo
    ├── 04-board.md            # board (if used)
    ├── reports/T<n>.md        # one per ticket attempt; a retry adds -2, -3
    ├── 05-review.md           # staff-engineer, review mode
    ├── 05-security-review.md  # cso, mode 2 (if used)
    ├── 06-qa.md               # qa-lead
    └── 07-release.md          # release-manager
```

Whether to commit `.omni/` is the founder's choice. Committing `charter.md` and `decisions.md` lets every future run, and every teammate, start from the same context. Run folders are useful history but can be ignored in `.gitignore`.

## STATUS.md

Update it at every phase boundary. It is what the founder reads to see the company working.

```
# <name> - <mode> mode

Phase: 4 build, wave 2 of 3
Founder approval: given 2026-10-09 (plan) | waiting (release)
Baseline: HEAD 3f2c1ab, snapshot 9e4d0c7; founder's files: none; `npm test` -> 40 passed, 1 failed (test/legacy.test.js "imports v1 csv")
Snapshots: before wave 2 b71f02a
Subagent calls: 14 of 30 (CFO budget line)

| Role | Status | Output |
|---|---|---|
| CEO | done | 01-vision.md |
| CPO | done | 02-spec.md |
| CTO | done | 03-architecture.md |
| CSO | threat model done, review pending | 03-threat-model.md |
| CFO | done: 3 engineers max | 04-budget.md |
| Eng manager | done: 7 tickets, 3 waves | 04-tickets.md |

| Ticket | Level | Owner files | Wave | Status |
|---|---|---|---|---|
| T0 contracts | staff | src/types.ts | 0 | done |
| T1 parser | senior | src/parse/ | 1 | done |
| T2 storage | junior | src/store.ts | 1 | blocked -> re-planned as T2b (senior) |

Suite after last wave: `npm test` -> 52 passed, 1 failed (same as baseline)
Open gates: CSO release review, QA
Re-plans: 1   Review rounds: 0   QA rounds: 0

Decisions:
- CTO and design lead disagreed on paging; chose cursor paging (CTO) because the list can change while paging.
- Assumed (founder said not to ask): tags are case-sensitive.
```

## Snapshots

A snapshot records the whole working tree, including new untracked files and excluding `.omni/`, as a git tree object, without touching the real index or the files. It works from any subdirectory and in linked worktrees. Shell state does not survive between tool calls, so run it as one command each time and write the printed tree id into `STATUS.md`:

```sh
cd "$(git rev-parse --show-toplevel)" && idx="$(git rev-parse --git-path omni-index)" && GIT_INDEX_FILE="$idx" git add -A -- . ':!.omni' && GIT_INDEX_FILE="$idx" git write-tree
```

Then compare two recorded ids:

```sh
git diff --name-only <before-id> <after-id>          # files changed during a wave
git diff <baseline-id> <current-id> -- <file>        # the run's change to one file
```

Every file changed during a wave must be owned by a ticket in that wave. The run's changes for review and release are the diff from the baseline snapshot, so the founder's own uncommitted edits never count as the run's work.

## decisions.md

Append one block per run. Keep each line a decision or a lesson someone can act on.

```
## 2026-10-09 habit-tracker (standard mode, shipped)
- Decision: store habits in SQLite, not JSON files - concurrent writes from the CLI and the web view (CTO).
- Decision: no social features this round - the founder confirmed the audience is single users (CEO).
- Lesson: T2 was too vague for a junior; tickets that touch the storage schema go to senior engineers.
- Open: reminders deferred to the next run.
```

## charter.md

Optional. If the founder wants one, offer this template and let them fill it in.

```
# Charter
Mission: <one sentence>
Users: <who, and what they care about>
Principles: <3-5, e.g. "privacy first: no data leaves the device">
Constraints: <stack, budget, licenses, deadlines, things never to do>
Definition of shipped: <e.g. merged to main with CI green and a changelog entry>
```

## Engineer prompt

```
You are <role> on ticket T<n> of the run in .omni/company/<run>/.
Read your ticket in 04-tickets.md and, where they exist, the contracts in 03-architecture.md,
the criteria in 02-spec.md (or the must-haves in 01-vision.md in quick mode), the copy in
03-ux.md and the SEC requirements in 03-threat-model.md.
You own: <code and test files>. Change nothing else. Never touch the founder's files: <list or none>.
Baseline failing tests (not yours to fix): <names or none>.
Working at the same time: T<a> owns <files>; T<b> owns <files>. They are editing now: run only
checks scoped to your files, and leave failures in their files to them.
Return your report in the format your role brief defines.
```
