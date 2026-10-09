import { query } from './db.js';
import * as audit from './audit.js';

export class NotFoundError extends Error {}

/** Returns the user, or null when no user has this id. */
export async function getUser(id) {
  const rows = await query('SELECT id, email, name FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function deactivateUser(id, actor) {
  await query('UPDATE users SET active = false WHERE id = $1', [id]);
  audit.log('deactivate', { id, actor });
}

/** Case-insensitive search by name for the admin console. */
export async function searchUsers(term, limit = 20) {
  const safeLimit = Math.min(Number(limit) || 20, 100);
  return query(
    `SELECT id, email, name FROM users WHERE lower(name) LIKE '%${term.toLowerCase()}%' ORDER BY name LIMIT $1`,
    [safeLimit],
  );
}
