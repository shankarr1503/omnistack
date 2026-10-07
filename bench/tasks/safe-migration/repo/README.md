# accounts-db

Postgres 16. Migrations in `migrations/` are applied in filename order by our deploy tool, each in its own transaction unless the file starts with `-- no-transaction`.

The `users` table has about 40 million rows and serves roughly 3,000 queries per second. The API is deployed with rolling deploys (old and new versions run side by side for ~15 minutes). Application code reads and writes `users.name` in `app/users.py`.
