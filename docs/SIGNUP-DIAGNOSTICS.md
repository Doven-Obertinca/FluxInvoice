# Production signup origin correction

Observed in the Vercel project on 2026-10-15:

- Production requests use `https://www.erechno.de/api/auth/sign-up/email`.
- The apex domain `erechno.de` redirects (308) to `www.erechno.de`.
- Production `APP_URL` and `BETTER_AUTH_URL` both contain `https://erechno.de`.
- Better Auth trusts only the configured `BETTER_AUTH_URL`.

Browser signup requests therefore fail the origin check with `INVALID_ORIGIN`
before user/account creation or verification email delivery. The regression test
in `tests/beta-auth.test.ts` reproduces this with production origin checking
explicitly enabled (Better Auth disables it by default under Vitest).

## Pending configuration fix

Set these two existing **Production** variables together:

```dotenv
APP_URL=https://www.erechno.de
BETTER_AUTH_URL=https://www.erechno.de
```

Keep the existing apex-to-www redirect. Keep one exact trusted origin, required
email verification, TLS validation, database permissions and beta safeguards.
Do not add wildcard origins or disable origin/CSRF checks.

The attempted configuration save was blocked by automatic approval review.
Neither variable was changed. No commit, push or deployment was performed.
These changes require explicit approval and a later authorized deployment to
become active. They remove the reproduced origin rejection; live database,
SMTP credentials and sender acceptance still require post-deployment verification.

## Code path and diagnostics

`apps/web/app/api/auth/[...all]/route.ts` wraps `toNextJsHandler(auth)`.
`apps/web/lib/server.ts` configures Better Auth, its PostgreSQL Drizzle adapter,
the email capability guard and verification callback. Better Auth checks origins
and rate limits, then checks email capability, finds/hashes/creates the user,
links the credential account and invokes the verification-email callback.

Nodemailer transport construction occurs at module initialization. It opens no
SMTP connection until `sendMail` in that callback. Beta does not prohibit signup
when transactional email is configured; it never bypasses verification.
Verification tokens for this flow are signed tokens, so successful signup need
not insert a `verifications` row. The table is still required for other auth flows.

Diagnostics use a server-generated request ID shared across framework logger,
API-error hook and response boundary, returned as `x-request-id`. They include
operation, result, safe error name/code and a fixed sanitized description.
Known PostgreSQL error codes are recovered through Drizzle's nested `cause`.
Unknown messages, stack traces, SQL, parameters, bodies, cookies, tokens, emails,
credentials and connection strings are never serialized. The response boundary
inspects only recognized error fields; it does not log response bodies.

Local integration verifies migrated user/account/session/rate-limit schema and
verification callback ordering. This is not proof of the deployed Neon schema
or grants. Vercel's external-API summary alone does not establish whether native
PostgreSQL or SMTP socket connections were attempted.
