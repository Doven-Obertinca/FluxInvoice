import { describe, expect, it } from 'vitest';
import { validateProduction, databaseUrl } from '@flux/shared';
import { complianceRuntime } from '../packages/application/src/runtime';
const valid = {
  APP_ENV: 'production',
  VERCEL: '1',
  AWS_ACCESS_KEY_ID: 'unit-fixture',
  AWS_SECRET_ACCESS_KEY: 'unit-fixture',
  APP_URL: 'https://erechno.de',
  BETTER_AUTH_URL: 'https://erechno.de',
  BETTER_AUTH_SECRET: 'unit-fixture-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  DATABASE_URL:
    'postgresql://fixture:fixture@db.provider.dev/app?sslmode=verify-full',
  SMTP_URL: 'smtps://fixture:fixture@smtp.provider.dev:465',
  MAIL_FROM: 'mail@erechno.de',
  ARCHIVE_MODE: 'S3_OBJECT_LOCK',
  ARCHIVE_BUCKET: 'fixture',
  ARCHIVE_KMS_KEY_ARN: 'arn:aws:kms:eu-central-1:123456789012:key/unit-fixture',
  AWS_REGION: 'eu-central-1',
};
describe('hosted configuration', () => {
  it('accepts externally configured web without Java paths', () =>
    expect(() => validateProduction(valid)).not.toThrow());
  it.each([
    { APP_ENV: 'development' },
    { APP_URL: 'http://localhost:3000' },
    { BETTER_AUTH_URL: 'https://other.domain.de' },
    { MAIL_FROM: 'mail@example.test' },
    { BETTER_AUTH_SECRET: 'replace-with-at-least-32-random-characters' },
    { SMTP_URL: 'smtp://localhost:1025' },
    { ARCHIVE_MODE: 'LOCAL' },
    {
      DATABASE_URL:
        'postgresql://fixture:fixture@db.provider.dev/app?sslmode=require',
    },
    { BILLING_ENABLED: 'true' },
  ])('rejects unsafe configuration without exposing values: %j', (override) => {
    expect(() => validateProduction({ ...valid, ...override })).toThrow(
      'configuration',
    );
  });
  it('requires worker paths and rejects hosting the worker on Vercel', () => {
    expect(() => validateProduction(valid, 'worker')).toThrow(
      'persistent worker',
    );
    expect(() =>
      validateProduction(
        {
          ...valid,
          VERCEL: undefined,
          DELIVERY_FROM: 'invoices@erechno.de',
          JAVA_BIN: '/opt/java/bin/java',
          COMPLIANCE_HOME: '/opt/compliance',
        },
        'worker',
      ),
    ).not.toThrow();
  });
  it('never includes credentials in configuration errors', () => {
    const credentials = 'postgresql://sensitive:sensitive@localhost/db';
    try {
      validateProduction({ ...valid, DATABASE_URL: credentials });
    } catch (error) {
      expect(String(error)).not.toContain('sensitive');
    }
  });
  it('web validation cannot execute the local JVM', async () => {
    const runtime = complianceRuntime('/tmp', 'web');
    await expect(
      runtime.validator.validate(Buffer.from('<invoice/>')),
    ).rejects.toThrow('WORKER_ONLY');
  });
  it('operations cannot silently pick a development database', () => {
    const previous = process.env.APP_ENV;
    const url = process.env.DATABASE_URL;
    delete process.env.APP_ENV;
    delete process.env.DATABASE_URL;
    try {
      expect(() => databaseUrl()).toThrow('DATABASE_URL');
    } finally {
      if (previous !== undefined) process.env.APP_ENV = previous;
      if (url !== undefined) process.env.DATABASE_URL = url;
    }
  });
});
