Add these features to tasks-cli:

1. Tags: `add "<title>" --tag <name>`, repeatable. A tag is lowercase letters, digits and dashes; anything else is rejected with an error message and exit code 1. `list` shows tags after the title as ` +<tag>`, in the order given.
2. Due dates: `add "<title>" --due YYYY-MM-DD`. Invalid dates (wrong format, or impossible like 2026-02-30) are rejected with an error message and exit code 1. `list` shows ` (due YYYY-MM-DD)` after the tags.
3. Filters: `list --tag <name>` shows only tasks with that tag. `list --overdue` shows only open (not done) tasks whose due date is before today. The two can be combined. "Today" is the `TODAY` environment variable (YYYY-MM-DD) when it is set, otherwise the local date.
4. `stats` prints exactly these lines, in order: `total: N`, `open: N`, `done: N`, `overdue: N`, then one line per tag, `tag <name>: N`, sorted by tag name, counting all tasks (open or done) with that tag.
5. Existing `tasks.json` files whose tasks have no tags or due dates must keep working.

The list line format is: `#<id> [ ] <title>` (or `[x]` when done), then ` +<tag>` for each tag, then ` (due YYYY-MM-DD)` if there is a due date. The title is everything that is not an option.
