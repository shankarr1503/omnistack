/** Pages are 1-based: page 1 is the first page. */
export function pageParams(page, size = 20) {
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(Math.max(1, Number.parseInt(size, 10) || 20), 100);
  return { limit: pageSize, offset: (pageNumber - 1) * pageSize };
}
