import { query } from './db.js';
import { cached } from './cache.js';
import { pageParams } from './pagination.js';

const CACHE_TTL_MS = 30_000;

// Every request is scoped to the caller's tenant (req.tenantId is set by auth middleware).
export function listProjects(tenantId, page, search = '') {
  const { limit, offset } = pageParams(page);
  const cacheKey = `projects:${page}:${search}`;
  return cached(cacheKey, CACHE_TTL_MS, () =>
    query(
      `SELECT id, name FROM projects
        WHERE tenant_id = $1 AND name ILIKE $2
        ORDER BY name LIMIT $3 OFFSET $4`,
      [tenantId, `%${search}%`, limit, offset],
    ),
  );
}
