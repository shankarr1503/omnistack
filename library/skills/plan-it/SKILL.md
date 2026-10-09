---
name: plan-it
description: Write a concrete implementation plan before coding anything non-trivial. Use for features, multi-file changes, refactors, migrations, or any task where you would otherwise start editing without knowing every file you will touch. Produces small, ordered, verifiable steps.
---

# Plan it

Ten minutes of planning saves an afternoon of rework. A good plan lets someone else (or you after a context reset) execute it without re-deriving anything.

## 1. Understand before planning

- Restate the goal in one sentence and the definition of done as checkable statements.
- Read the code that will change and the code that calls it. Find existing patterns, helpers and tests for similar features — reuse beats invention.
- Read project instructions: `README`, `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`, architecture docs.
- List unknowns. Resolve the ones you can by reading code. Ask the user only about real product decisions (behavior, scope, trade-offs), never things the code can answer.

## 2. Choose the approach

If there is more than one reasonable design, name 2–3 options in a line each with the main trade-off, pick one, and say why. Prefer the option that changes the least, matches existing conventions, and is easiest to undo.

## 3. Write the plan

Each step must be small (one commit's worth), ordered so the build stays green after every step, and verifiable:

```
## Goal
<one sentence>

## Done when
- [ ] <observable outcome>
- [ ] <tests/checks that pass>

## Steps
1. <verb + what> — files: <paths> — verify: <command or check>
2. ...

## Risks
- <what could go wrong> → <mitigation or how you will detect it>

## Out of scope
- <things deliberately not done>
```

Rules for steps:

- Name actual files and functions, not "update the backend".
- Tests go in the same step as the behavior they cover (or before it), not in a final "add tests" step.
- Put risky or uncertain steps early so surprises appear before most of the work is done.
- Data/schema changes, public API changes and deletions get their own steps with explicit rollback notes.

## 4. Execute

- Follow the plan in order. Run each step's verification before moving on.
- When reality disagrees with the plan, stop and update the plan first — don't silently drift. Tell the user if scope or approach changed.
- Check off steps as you go so progress is visible.

## Anti-patterns

- Plans that restate the task ("implement the feature, add tests, update docs").
- Steps that leave the build broken until the final step.
- Gold-plating: abstractions, config options or generality the task does not need.
