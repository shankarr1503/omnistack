---
name: safe-refactor
description: Restructure code without changing behavior. Use when asked to refactor, clean up, simplify, rename, extract, split a large file or function, or remove duplication. Locks behavior with tests first, then moves in small verified steps.
---

# Safe refactor

A refactor changes structure, never behavior. If behavior changes, it is not a refactor — it is a rewrite with extra risk.

## 1. Lock behavior first

- Find the tests covering the code. Run them; they must be green before you start.
- If coverage is thin, add characterization tests that pin the current behavior — including odd behavior that callers may depend on. (See the `legacy-tests` skill.)
- Find every caller: search for the symbol, dynamic uses (string names, reflection, routes, DI config, templates), exports, and public API consumers outside the repo.

## 2. Move in small steps

Each step is one mechanical transformation, followed by running the tests:

- Rename (use the IDE/language server rename where possible, then search for string references).
- Extract function / module; inline function; move file (update imports).
- Replace conditional with lookup/polymorphism; introduce parameter object.
- Delete dead code — only after proving it is unused (search, coverage, logs). "Looks unused" is not proof for public or dynamically-referenced code.

Commit (or checkpoint) after each green step so you can bisect or revert.

## 3. Rules

- **No behavior changes mixed in.** Found a bug? Note it, finish or pause the refactor, and fix the bug in a separate change with its own test.
- **No formatting churn** in files you are not otherwise changing.
- **Keep public interfaces stable** unless changing them is the goal; if so, migrate callers in the same change or leave a deprecated shim.
- **Don't over-abstract.** Three similar blocks are fine; an abstraction must make the code easier to read _now_, not hypothetically flexible.
- Performance-sensitive code: benchmark before and after.

## 4. Verify

- Full test suite, typecheck, lint pass.
- The diff reads as pure structure: a reviewer can confirm no behavior changed. Large moves are easier to review as separate "move only" and "edit" commits.

## Report

What was restructured and why it is better (concretely: fewer branches, smaller function, removed duplication of X), the tests that guard it, and any bugs or follow-ups noticed but deliberately not fixed.
