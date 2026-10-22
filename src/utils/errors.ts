export type ErrorCode =
  | 'PROVIDER'
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'CONTEXT_OVERFLOW'
  | 'PERMISSION_DENIED'
  | 'REPOSITORY'
  | 'VERIFICATION'
  | 'CONFIGURATION'
  | 'BUDGET'
  | 'CANCELLED';
export class OmniError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = `${code}Error`;
  }
}
export class ProviderError extends OmniError {
  /** `status` is set when the provider answered with an HTTP error instead of generating. */
  constructor(
    message: string,
    retryable = false,
    readonly status?: number,
  ) {
    super('PROVIDER', message, retryable);
  }
}
/** True when the provider refused the request outright, so it generated and billed nothing. */
export function refused(error: unknown): boolean {
  return (
    error instanceof AuthenticationError ||
    error instanceof RateLimitError ||
    error instanceof ModelUnavailableError ||
    error instanceof ContextOverflowError ||
    // A gateway timeout (504, Cloudflare 524) may hide a reply the model generated and billed.
    (error instanceof ProviderError &&
      error.status !== undefined &&
      error.status !== 504 &&
      error.status !== 524)
  );
}
export class AuthenticationError extends OmniError {
  constructor(message = 'Provider authentication failed') {
    super('AUTHENTICATION', message);
  }
}
export class RateLimitError extends OmniError {
  constructor() {
    super('RATE_LIMIT', 'Provider rate limit reached', true);
  }
}
export class TimeoutError extends OmniError {
  constructor() {
    super('TIMEOUT', 'Operation timed out', true);
  }
}
export class ModelUnavailableError extends OmniError {
  constructor() {
    super('MODEL_UNAVAILABLE', 'Model unavailable');
  }
}
export class ContextOverflowError extends OmniError {
  constructor() {
    super('CONTEXT_OVERFLOW', 'Provider context limit exceeded');
  }
}
export class PermissionDeniedError extends OmniError {
  constructor(message: string) {
    super('PERMISSION_DENIED', message);
  }
}
export class RepositoryError extends OmniError {
  constructor(message: string) {
    super('REPOSITORY', message);
  }
}
export class VerificationError extends OmniError {
  constructor(message: string) {
    super('VERIFICATION', message);
  }
}
export class ConfigurationError extends OmniError {
  constructor(message: string) {
    super('CONFIGURATION', message);
  }
}
