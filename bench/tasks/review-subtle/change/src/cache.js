const store = new Map();
export function cached(key, ttlMs, load) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = load();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}
