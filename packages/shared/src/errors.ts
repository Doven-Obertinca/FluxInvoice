export class AppError extends Error {
  constructor(
    public readonly code:
      | 'AUTHENTICATION'
      | 'AUTHORIZATION'
      | 'VALIDATION'
      | 'CONFLICT'
      | 'NOT_FOUND'
      | 'EXTERNAL_SERVICE'
      | 'RATE_LIMIT'
      | 'CAPABILITY_UNAVAILABLE',
    message: string,
  ) {
    super(message);
  }
}
