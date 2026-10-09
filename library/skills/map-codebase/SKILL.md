---
name: map-codebase
description: Rapidly understand an unfamiliar repository and produce a practical map of it. Use when starting work in a new codebase, onboarding, asked "how does this work", "where is X handled", or before making changes in code you have not read. Traces real execution paths instead of summarising file names.
---

# Map codebase

Goal: in a short time, know how to run it, where things live, and how a request actually flows through it — with file references a newcomer can follow.

## 1. Orient (read, don't guess)

- `README`, `CONTRIBUTING`, `AGENTS.md`/`CLAUDE.md`, `docs/`, architecture decision records.
- Manifests: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile` — language, framework, scripts, key dependencies.
- Build/run/test: scripts, `Makefile`, `Dockerfile`, `docker-compose.yml`, CI workflows (CI is the most reliable documentation of how to build and test).
- Layout: list top-level directories and note what each is for. Check for a monorepo (workspaces, multiple manifests).
- Recent activity: `git log --oneline -30` and the most frequently changed files (`git log --format= --name-only | sort | uniq -c | sort -rn | head -20`) show where the action is.

## 2. Find the entry points

Where execution starts: `main` functions, server bootstrap, route/handler registration, CLI command definitions, job/queue consumers, cron definitions, serverless handlers, frontend router and root component.

## 3. Trace one real flow end to end

Pick the most important user action (e.g. "create order", "login", "render dashboard") and follow it: entry point → routing → validation → business logic → data access → external calls → response. Note each hop as `file:function`. This one trace teaches more than reading every directory.

## 4. Note the conventions

Error handling, logging, config and secrets loading, dependency injection, database access pattern, test layout and fixtures, naming. New code should follow these.

## Output

```
# <Project> map

What it is: <one paragraph>
Stack: <language, framework, datastore, key services>

Run:   <commands>   Test: <commands>   Build/deploy: <how>

Layout:
  <dir>/  — <purpose>
  ...

Key flow: <name>
  1. <file:function> — <what happens>
  2. ...

Conventions: <bullets>
Gotchas: <surprising things, sharp edges, generated code, legacy areas>
Open questions: <what you could not determine>
```

Cite files for every claim. Mark anything inferred rather than read as "(inferred)".
