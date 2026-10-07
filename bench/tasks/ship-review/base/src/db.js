// Thin wrapper around the SQL driver. `query(sql, params)` uses $1, $2 placeholders.
export async function query(sql, params = []) {
  return globalThis.__db.query(sql, params);
}
