import { query } from './db.js';

export class EmailTakenError extends Error {}

// users.email has a UNIQUE constraint.
export async function createUser(email, name) {
  const result = await query(
    'INSERT INTO users (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id',
    [email.toLowerCase(), name],
  );
  if (!result.rowCount) throw new EmailTakenError('email already registered');
  return result.rows[0].id;
}
