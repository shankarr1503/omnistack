export function validate(config) {
  const errors = [];
  if (config.timeout === undefined) errors.push('timeout is required');
  if (config.retries !== undefined && !Number.isInteger(config.retries))
    errors.push('retries must be an integer');
  return errors;
}
