---
name: test-first
description: Test-driven development discipline. Use when implementing a feature, fixing a bug, or changing behavior in code that has (or should have) tests. Write a failing test, watch it fail for the right reason, make it pass with the least code, then refactor.
---

# Test first

Tests written after the code tend to test what the code does, not what it should do. Write the test first and watch it fail; that failure is the proof the test can catch a bug.

## The loop

Repeat for each small behavior (one rule, one edge case, one bug):

1. **Red.** Write one test for the next behavior. Run it. It must fail, and the failure message must be about the missing behavior — not an import error, typo or missing fixture. If it passes immediately, the test is wrong or the behavior already exists; find out which.
2. **Green.** Write the smallest code that makes it pass. Hard-coding is fine if the next test will force generalisation. Run the test, then the related suite.
3. **Refactor.** With tests green, remove duplication and improve names. Run the tests after each change. No new behavior in this step.

Keep cycles short: minutes, not hours. If a step takes long, the behavior was too big — split it.

## Before the first test

- Find the existing test setup: framework, file naming, helpers, fixtures, how to run a single test. Match it. Do not introduce a new framework.
- Find the command that runs one test fast (e.g. `npx vitest run path -t name`, `pytest path::test -x`, `go test ./pkg -run Name`, `cargo test name`). You will run it dozens of times.
- List the behaviors to build as a checklist of test names. Order them from simplest to hardest.

## Good tests

- Test behavior through the public interface, not private helpers or call sequences. A refactor that keeps behavior should not break a test.
- One reason to fail per test. Name it as a sentence: `rejects_expired_tokens`, `returns empty list when no matches`.
- Arrange / act / assert, with the act step obvious.
- Cover: the happy path, boundaries (0, 1, many, max, empty, null), invalid input, and the error path.
- Deterministic: no real clock, network, randomness or ordering assumptions. Inject them.
- Mock only at boundaries you do not own (network, filesystem, time, third-party APIs). Mocking your own code usually tests the mock.

## Bug fixes

Always start with a test that reproduces the bug and fails. Then fix. The test stays as a regression guard.

## Rules

- Never weaken, skip, delete or loosen an assertion to make a test pass. If a test is genuinely wrong, say why and fix the test in its own step.
- Never mark work done with failing or skipped tests you introduced.
- If the code is hard to test, that is design feedback: inject the dependency, split the function, return a value instead of mutating global state.
- When you cannot run tests (no runtime, missing service), say so explicitly. Do not claim they pass.

## Report

List the tests added (names), show the final test command and its output summary, and note any behavior intentionally left untested and why.
