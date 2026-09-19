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
  constructor(message: string, retryable = false) {
    super('PROVIDER', message, retryable);
  }
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
