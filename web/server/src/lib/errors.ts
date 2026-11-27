export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
  get statusCode(): number {
    return this.status;
  }
}

export const errors = {
  validation: (message = 'Invalid request', details?: unknown) => new AppError(400, 'validation', message, details),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'unauthorized', message),
  invalidCredentials: () => new AppError(401, 'invalid_credentials', 'Invalid credentials'),
  accountLocked: (retryAfterSec?: number) =>
    new AppError(423, 'account_locked', 'Account temporarily locked', undefined, retryAfterSec ? { 'retry-after': String(retryAfterSec) } : undefined),
  forbidden: (message = 'Forbidden', details?: unknown) => new AppError(403, 'forbidden', message, details),
  csrf: () => new AppError(403, 'csrf', 'Missing or invalid X-Requested-With header'),
  notFound: (message = 'Not found') => new AppError(404, 'not_found', message),
  conflict: (message = 'Conflict', details?: unknown) => new AppError(409, 'conflict', message, details),
  tooLarge: (message = 'Payload too large', details?: unknown) => new AppError(413, 'payload_too_large', message, details),
  rateLimited: (retryAfterSec?: number) =>
    new AppError(429, 'rate_limited', 'Too many requests', undefined, retryAfterSec ? { 'retry-after': String(retryAfterSec) } : undefined),
  internal: (message = 'Internal server error') => new AppError(500, 'internal', message),
  exportUnavailable: (message = 'Export format unavailable') => new AppError(501, 'export_unavailable', message),
};
