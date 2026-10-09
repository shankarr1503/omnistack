import { query } from './db.js';
import * as audit from './audit.js';

export class NotFoundError extends Error {}

export async function getUser(id) {
  const rows = await query('SELECT id, email, name FROM users WHERE id = $1', [id]);
  if (!rows.length) throw new NotFoundError(`user ${id} not found`);
  return rows[0];
}

export async function deactivateUser(id, actor) {
  await query('UPDATE users SET active = false WHERE id = $1', [id]);
  await audit.log('deactivate', { id, actor });
}
