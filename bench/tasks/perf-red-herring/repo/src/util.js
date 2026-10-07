export function dedupe(items, key) {
  const out = [];
  for (const item of items) {
    if (!out.some((existing) => key(existing) === key(item))) out.push(item);
  }
  return out;
}
