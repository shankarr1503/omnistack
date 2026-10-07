import { query } from './db.js';
export async function log(action, details) {
  await query('INSERT INTO audit_log (action, details) VALUES ($1, $2)', [
    action,
    JSON.stringify(details),
  ]);
}
