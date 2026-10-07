---
name: legacy-tests
description: Add tests to untested or legacy code before changing it. Use when code has little or no test coverage, before refactoring or modifying risky old code, or when asked to "add tests" to existing behavior. Writes characterization tests that pin what the code does today.
---

# Legacy tests

Legacy code is code without tests. Before changing it, capture what it does now — right or wrong — so any change in behavior is visible.

## 1. Pick the seam

- Identify the smallest unit you can call from a test with the behavior you need to protect: a function, a class, a CLI command, an HTTP endpoint.
- If nothing is callable in isolation, find a seam: a parameter you can pass, a dependency you can inject, a function you can extract _mechanically_ (no logic changes) to make it testable. Keep these enabling changes tiny and separate.
- Prefer testing at a higher level (endpoint, command) when internals are tangled; you can add finer tests later.

## 2. Characterize behavior

- Call the code with representative inputs and assert on the **actual** outputs you observe, including surprising ones. Name such tests clearly: `currently_returns_null_for_empty_input`.
- Cover: typical inputs, boundaries, invalid inputs, and error paths. Use real production-like examples (anonymised) when available.
- For outputs that are large or complex, snapshot/golden-file tests are acceptable — keep them readable and reviewed, and normalise volatile parts (timestamps, IDs, ordering).
- Pin external effects: what gets written, sent, or logged. Replace the network, clock and randomness with fakes at the boundary.

## 3. Check the tests can fail

Temporarily break the code (flip a condition, change a constant) and confirm a test fails. If nothing fails, the tests are not protecting that behavior. Revert the break.

## 4. Separate "is" from "should"

When you find behavior that looks like a bug, do **not** fix it in this step. Pin it, mark it (`// characterization: looks wrong, see issue`), and report it. Fixing it is a separate, deliberate behavior change with its own test.

## 5. Report

Which behaviors are now covered, how to run the tests, suspected bugs discovered, and what remains untested (and why — e.g. needs a real database).
