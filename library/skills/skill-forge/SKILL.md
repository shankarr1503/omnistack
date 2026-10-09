---
name: skill-forge
description: Create a new high-quality agent skill (SKILL.md) for Claude Code, Codex or OpenCode. Use when the user wants to capture a workflow, checklist, or team convention as a reusable skill, or to improve an existing skill's triggering and instructions.
---

# Skill forge

A skill is instructions an agent loads when its description matches the task. Great skills change behavior the agent would otherwise get wrong; weak skills restate what it already does.

## 1. Find the behavior worth encoding

Ask (or infer from the conversation):

- What task does this cover, and what does the agent currently get wrong or do inconsistently?
- What does an expert do differently — the steps, checks, ordering, and things they refuse to do?
- What does a good result look like? Get one real example if possible.

If the answer is "nothing the agent would not already do", the skill is not needed.

## 2. Write the description first

The `description` decides when the skill loads. It must say **what** it does and **when** to use it, with the words users actually type.

- Good: `Zero-downtime database migrations. Use when adding, renaming or dropping columns, tables or indexes, or backfilling data.`
- Bad: `Helps with databases.`

Keep it under ~300 characters. Front-load the trigger words.

## 3. Write the body

```
---
name: kebab-case-name        # must match the directory name
description: <what + when>
---

# Title

<One or two sentences: the core principle and why it matters.>

## <Phase or topic>
- Concrete, ordered, checkable instructions.
- Commands and tools to use, with examples.

## Rules / anti-patterns
- Things never to do, and what to do instead.

## Output
<The exact report shape to produce.>
```

Principles:

- **Specific over general.** "Run `EXPLAIN ANALYZE` and check for sequential scans on large tables" beats "check query performance".
- **Explain why** for non-obvious rules, so the agent can handle cases the rule did not anticipate.
- **Short.** Aim for under ~150 lines. Put long references in separate files next to `SKILL.md` and link them.
- **Tool-agnostic** unless the skill is about a specific tool; mention alternatives per ecosystem.
- **Evidence-based endings.** Require the agent to report what it verified and what it did not.
- **Safe defaults.** Never instruct destructive actions (force-push, dropping data, deleting files) without explicit user confirmation.

## 4. Test it

Try 3–5 realistic prompts: ones that should trigger the skill, and near-misses that should not. Check the agent loads it, follows the steps, and produces the output shape. Tighten the description or instructions where it drifts.

## Install locations

- Claude Code: `~/.claude/skills/<name>/SKILL.md` (personal) or `.claude/skills/<name>/SKILL.md` (project).
- Codex: `~/.agents/skills/<name>/SKILL.md`.
- OpenCode: `~/.config/opencode/skills/<name>/SKILL.md`.
