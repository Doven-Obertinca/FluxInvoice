import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { logOperation } from './index';

const requests = new AsyncLocalStorage<{ requestId: string }>();
// Messages are fixed descriptions, never redacted fragments of untrusted text.
const errors: Record<string, string> = {
  '42P01': 'Authentication database table is missing.',
  '42703': 'Authentication database column is missing.',
  '42501': 'Authentication database permission denied.',
  '23505': 'Authentication database uniqueness constraint failed.',
  '23502': 'Authentication database required field is missing.',
  '28P01': 'Authentication database credentials rejected.',
  ECONNREFUSED: 'Authentication provider connection refused.',
  ETIMEDOUT: 'Authentication provider connection timed out.',
  ENOTFOUND: 'Authentication provider hostname could not be resolved.',
  CERT_HAS_EXPIRED: 'Authentication provider TLS certificate expired.',
  DEPTH_ZERO_SELF_SIGNED_CERT:
    'Authentication provider TLS certificate is untrusted.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    'Authentication provider TLS certificate verification failed.',
  EAUTH: 'Email provider authentication failed.',
  EENVELOPE: 'Email provider rejected the envelope.',
  MAIL_UNAVAILABLE: 'Authentication email transport is unavailable.',
  MAIL_REJECTED: 'Authentication email was not accepted.',
  SERVICE_UNAVAILABLE: 'Authentication email capability is unavailable.',
  INVALID_ORIGIN: 'Authentication request origin is not trusted.',
  INVALID_CALLBACK_URL: 'Authentication callback origin is not trusted.',
  FAILED_TO_CREATE_USER: 'Authentication user creation failed.',
  FAILED_TO_CREATE_SESSION: 'Authentication session creation failed.',
  TOO_MANY_REQUESTS: 'Authentication rate limit exceeded.',
};

export function safeAuthenticationError(error: unknown) {
  const seen = new Set<unknown>();
  let selected: string | undefined;
  let current = error;
  // Drizzle wraps the PostgreSQL error in cause. Inspect only specific fields.
  for (let depth = 0; depth < 6 && current && !seen.has(current); depth++) {
    seen.add(current);
    if (typeof current === 'string') {
      if (Object.hasOwn(errors, current)) selected = current;
      break;
    }
    if (typeof current !== 'object') break;
    const value = current as Record<string, unknown>;
    const body = value.body as { code?: unknown } | undefined;
    for (const code of [value.code, body?.code, value.status, value.message])
      if (typeof code === 'string' && Object.hasOwn(errors, code))
        selected = code;
    current = value.cause;
  }
  return {
    errorName: 'AuthenticationError',
    errorCode: selected ?? 'AUTHENTICATION_FAILED',
    errorMessage: selected
      ? errors[selected]!
      : 'Authentication failed; unrecognized error details suppressed.',
  };
}

export function logAuthenticationFailure(error: unknown) {
  logOperation({
    operation: 'authentication',
    result: 'error',
    requestId: requests.getStore()?.requestId ?? randomUUID(),
    ...safeAuthenticationError(error),
  });
}

export function authenticationHandler(
  handler: (request: Request) => Promise<Response>,
) {
  return (request: Request) =>
    requests.run({ requestId: randomUUID() }, async () => {
      try {
        const response = await handler(request);
        // Covers handled API errors, which Better Auth does not always log.
        if (response.status >= 400) {
          let error: unknown;
          try {
            error = await response.clone().json();
          } catch {
            /* No response content is logged. */
          }
          logAuthenticationFailure(error);
        }
        const headers = new Headers(response.headers);
        headers.set('x-request-id', requests.getStore()!.requestId);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        logAuthenticationFailure(error);
        throw error;
      }
    });
}
