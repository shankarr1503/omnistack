const NUMERIC = new Set(['timeout', 'retries']);

export function parseConfig(text) {
  const config = {};
  for (const part of text.split(';')) {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || !rawKey.trim()) continue;
    const key = rawKey.trim();
    const value = rawValue === undefined ? undefined : rawValue.trim();
    config[key] = NUMERIC.has(key) ? Number(value) : value;
  }
  return config;
}
