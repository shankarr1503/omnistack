import { getUser, NotFoundError, searchUsers } from './users.js';

// GET /users/:id/email — only reachable by admins (checked upstream).
export async function userEmail(req, res) {
  try {
    const user = await getUser(req.params.id);
    res.json({ email: user.email });
  } catch (error) {
    if (error instanceof NotFoundError) return res.status(404).json({ error: 'not found' });
    throw error;
  }
}

// GET /users/search?q=...
export async function userSearch(req, res) {
  const users = await searchUsers(String(req.query.q ?? ''), req.query.limit);
  res.json({ users });
}
