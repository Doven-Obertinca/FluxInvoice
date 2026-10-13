import { APIError, createAuthMiddleware } from 'better-auth/api';
import { authenticationRequiresEmail, runtimeCapabilities } from '@flux/shared';

export function requiresEmailVerification() {
  return process.env.APP_ENV !== 'test';
}
export const authenticationEmailGuard = createAuthMiddleware(async (ctx) => {
  if (
    authenticationRequiresEmail(ctx.path) &&
    !runtimeCapabilities().transactionalEmail
  )
    throw new APIError('SERVICE_UNAVAILABLE', {
      message:
        'Der E-Mail-Versand ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',
    });
});
