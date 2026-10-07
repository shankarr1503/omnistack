import { query } from './db.js';
import { cached } from './cache.js';
import { pageParams } from './pagination.js';

// Every request is scoped to the caller's tenant (req.tenantId is set by auth middleware).
export function listProjects(tenantId, page) {
  const { limit, offset } = pageParams(page);
  return cached(`projects:${tenantId}:${page}`, 30_000, () =>
    query('SELECT id, name FROM projects WHERE tenant_id = $1 ORDER BY name LIMIT $2 OFFSET $3', [
      tenantId,
      limit,
      offset,
    ]),
  );
}
