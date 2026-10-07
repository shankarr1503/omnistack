const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const toInt = (value, fallback) => Number.parseInt(value, 10) || fallback;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Converts page/size query parameters into SQL LIMIT/OFFSET.
 * @param {string|number} page 1-based page number
 * @param {string|number} [size] page size, 1-100
 */
export function pageParams(page, size = DEFAULT_PAGE_SIZE) {
  const pageNumber = Math.max(1, toInt(page, 1));
  const pageSize = clamp(toInt(size, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  return { limit: pageSize, offset: pageNumber * pageSize };
}
