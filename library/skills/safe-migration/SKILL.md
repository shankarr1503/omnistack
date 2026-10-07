---
name: safe-migration
description: Plan and write zero-downtime database and schema migrations. Use when adding, renaming or removing columns, tables or indexes, changing types or constraints, backfilling data, or changing message/API schemas that live systems depend on. Uses expand-and-contract and makes every step reversible.
---

# Safe migration

During a deploy, old and new code run against the same database at the same time. Every migration must work with **both**.

## The rule: expand, migrate, contract

Never rename or drop in one step. Split into separately deployed phases:

1. **Expand** — add the new thing (column, table, index), nullable or with a safe default. Old code ignores it.
2. **Dual-write** — deploy code that writes both old and new; reads still use old.
3. **Backfill** — copy existing data in batches.
4. **Switch reads** — deploy code reading the new thing. Verify.
5. **Contract** — stop writing the old thing, then drop it in a later release once nothing references it.

A rename is "add new + copy + switch + drop old", never `RENAME COLUMN` on a live table used by running code.

## Locking and size hazards

Know your database's behavior; check the docs for your version. Common traps:

- **Postgres:** create indexes with `CREATE INDEX CONCURRENTLY` (outside a transaction). Add foreign keys and check constraints as `NOT VALID`, then `VALIDATE` separately. Adding a column with a volatile default or changing a column type can rewrite the table. Set `lock_timeout` so a migration waiting on a lock does not block all traffic behind it.
- **MySQL:** check whether the ALTER is `INSTANT`/`INPLACE` or copies the table; use online schema change tools (gh-ost, pt-osc) for large tables.
- **Any database:** `NOT NULL` on an existing column requires a backfill first; unique constraints fail if duplicates exist — check before.

## Backfills

- Batch by primary key range (e.g. 1–10k rows per batch), commit per batch, sleep between batches, and make it resumable and idempotent.
- Never one giant `UPDATE` on a large table — it holds locks, bloats, and replicates slowly.
- Measure row counts before and after; verify with a query that finds unmigrated rows.

## Every migration needs

- A tested **down/rollback** path, or an explicit note that it is irreversible and why that is acceptable.
- A dry run against a production-sized copy or at least realistic data volumes, with the time it took.
- Separation from application code changes when ordering matters (schema first, code second; or the reverse for contract steps).

## Non-database schemas

The same rules apply to API responses, event/message formats, protobuf/Avro schemas and config files: add optional fields first, keep readers tolerant of unknown and missing fields, never reuse a removed field's name/number, and remove only after every producer and consumer has moved.

## Output

A phase-by-phase plan (what ships in each deploy), the migration files, lock/duration risk per step, verification queries, and rollback steps.
