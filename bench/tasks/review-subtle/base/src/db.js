// query(sql, params) runs a parameterised Postgres query and resolves to { rows, rowCount }.
export async function query(sql, params = []) {
  return globalThis.__db.query(sql, params);
}
