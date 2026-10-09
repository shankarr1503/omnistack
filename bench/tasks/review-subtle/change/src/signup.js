import { query } from './db.js';

export class EmailTakenError extends Error {}

/** Creates a user. Throws EmailTakenError with a friendly message if the email is in use. */
export async function createUser(email, name) {
  const normalizedEmail = email.toLowerCase();
  const existing = await query('SELECT 1 FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount > 0) {
    throw new EmailTakenError(`${normalizedEmail} is already registered. Try signing in instead.`);
  }
  const result = await query('INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id', [
    normalizedEmail,
    name,
  ]);
  return result.rows[0].id;
}
