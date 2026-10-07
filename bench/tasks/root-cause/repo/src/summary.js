export function formatSummary(config) {
  const retries = config.retries ?? 0;
  return `timeout=${config.timeout.toFixed(0)}s retries=${retries}`;
}
