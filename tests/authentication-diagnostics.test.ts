import { expect, it, vi } from 'vitest';
vi.mock('../packages/observability/src/index', () => ({
  logOperation: vi.fn(),
}));
import { logOperation } from '../packages/observability/src/index';
import {
  authenticationHandler,
  logAuthenticationFailure,
  safeAuthenticationError,
} from '../packages/observability/src/authentication';

it('extracts a PostgreSQL cause without leaking query parameters or provider details', () => {
  const secret = 'postgres://private:password@host/db?token=private';
  const error = new Error(secret, {
    cause: Object.assign(new Error('private@example.test'), {
      code: '42703',
      detail: secret,
    }),
  });
  expect(safeAuthenticationError(error)).toEqual({
    errorName: 'AuthenticationError',
    errorCode: '42703',
    errorMessage: 'Authentication database column is missing.',
  });
  expect(JSON.stringify(safeAuthenticationError(error))).not.toContain(
    'private',
  );
  expect(
    safeAuthenticationError({ code: secret, name: secret, message: secret })
      .errorCode,
  ).toBe('AUTHENTICATION_FAILED');
});

it('correlates internal and handled API failures with a server-generated request id', async () => {
  vi.mocked(logOperation).mockClear();
  const handler = authenticationHandler(async () => {
    logAuthenticationFailure(
      Object.assign(new Error('secret'), { code: '42501' }),
    );
    return Response.json(
      {
        code: 'FAILED_TO_CREATE_USER',
        message: 'private@example.test',
        token: 'secret',
      },
      { status: 422 },
    );
  });
  const responses = await Promise.all([
    handler(new Request('https://erechno.de')),
    handler(new Request('https://erechno.de')),
  ]);
  const ids = responses.map((response) => response.headers.get('x-request-id'));
  expect(ids[0]).not.toBe(ids[1]);
  const calls = vi.mocked(logOperation).mock.calls.map(([data]) => data);
  expect(calls).toHaveLength(4);
  for (const id of ids)
    expect(calls.filter((data) => data.requestId === id)).toHaveLength(2);
  expect(JSON.stringify(calls)).not.toMatch(/secret|private@example/);
  expect(responses[0]!.status).toBe(422);
  expect((await responses[0]!.json()).code).toBe('FAILED_TO_CREATE_USER');
});

it('logs thrown failures and preserves the exception', async () => {
  const error = new Error('password=secret');
  await expect(
    authenticationHandler(async () => {
      throw error;
    })(new Request('https://erechno.de')),
  ).rejects.toBe(error);
  expect(JSON.stringify(vi.mocked(logOperation).mock.lastCall)).not.toContain(
    'password=secret',
  );
});
