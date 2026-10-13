import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authenticationRequiresEmail,
  environment,
  runtimeCapabilities,
  validateProduction,
  CapabilityUnavailableError,
} from '@flux/shared';
import { complianceRuntime } from '../packages/application/src/runtime';
import { EinvoiceService } from '../packages/application/src/einvoice';
import { DeliveryService } from '../packages/application/src/delivery';
import { IncomingService } from '../packages/application/src/incoming';
import { emailProvider } from '../packages/application/src/email-provider';
import type { Database } from '@flux/db';
import type { Pool } from 'pg';
import type { Principal } from '@flux/auth';
const beta = {
  APP_ENV: 'production',
  VERCEL: '1',
  ERECHNO_BETA_MODE: 'true',
  BILLING_ENABLED: 'false',
  APP_URL: 'https://erechno.de',
  BETTER_AUTH_URL: 'https://erechno.de',
  BETTER_AUTH_SECRET: 'unit-fixture-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  DATABASE_URL:
    'postgresql://fixture:fixture@db.provider.dev/app?sslmode=verify-full',
  ARCHIVE_MODE: 'S3_OBJECT_LOCK',
};
afterEach(() => vi.unstubAllEnvs());
function configure() {
  for (const name of [
    'SMTP_URL',
    'MAIL_FROM',
    'ARCHIVE_BUCKET',
    'ARCHIVE_KMS_KEY_ARN',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'DELIVERY_GATEWAY_URL',
  ])
    vi.stubEnv(name, undefined);
  for (const [name, value] of Object.entries(beta)) vi.stubEnv(name, value);
}
describe('explicit safe beta', () => {
  it('starts production web without SMTP, AWS or Stripe despite stale archive mode', () => {
    configure();
    expect(() => validateProduction(process.env)).not.toThrow();
    expect(environment().ERECHNO_BETA_MODE).toBe('true');
    expect(() => complianceRuntime('/tmp', 'web')).not.toThrow();
  });
  it('ignores stale AWS configuration without enabling archival', () => {
    expect(() =>
      validateProduction({
        ...beta,
        AWS_SECRET_ACCESS_KEY: 'unused-fixture',
        ARCHIVE_KMS_KEY_ARN: 'unused-fixture',
      }),
    ).not.toThrow();
    expect(
      runtimeCapabilities({ ...beta, AWS_SECRET_ACCESS_KEY: 'unused-fixture' })
        .compliantArchive,
    ).toBe(false);
  });
  it.each(['false', undefined])(
    'full production remains strict (%s)',
    (mode) => {
      expect(() =>
        validateProduction({ ...beta, ERECHNO_BETA_MODE: mode }),
      ).toThrow('SMTP_URL');
      expect(() =>
        validateProduction({ ...beta, ERECHNO_BETA_MODE: mode }),
      ).toThrow('ARCHIVE_BUCKET');
    },
  );
  it.each([
    {
      DATABASE_URL:
        'postgresql://fixture:fixture@db.provider.dev/app?sslmode=require',
    },
    { BETTER_AUTH_URL: 'http://erechno.de' },
    { BETTER_AUTH_SECRET: 'placeholder' },
    { SMTP_URL: 'smtp://fixture:fixture@smtp.provider.dev' },
    { ERECHNO_BETA_MODE: 'yes' },
  ])('retains security invariants %j', (override) => {
    expect(() => validateProduction({ ...beta, ...override })).toThrow();
  });
  it('never writes or fabricates archive evidence', async () => {
    configure();
    const runtime = complianceRuntime('/tmp', 'web');
    await expect(
      runtime.archive.put('unused', Buffer.from('x'), new Date()),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);
    await expect(
      runtime.archive.get('unused', 'unused'),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);
    await expect(runtime.validator.validate(Buffer.from('x'))).rejects.toThrow(
      'WORKER_ONLY',
    );
  });
  it('blocks commands and worker processing before any database state change', async () => {
    configure();
    const db = { transaction: vi.fn(), select: vi.fn() } as unknown as Database;
    const pool = { connect: vi.fn() } as unknown as Pool;
    const runtime = complianceRuntime('/tmp', 'web');
    const p = {} as Principal;
    const invoices = new EinvoiceService(
      db,
      pool,
      runtime.validator,
      runtime.archive,
    );
    const delivery = new DeliveryService(db, runtime.archive, emailProvider());
    const incoming = new IncomingService(
      db,
      pool,
      runtime.validator,
      runtime.archive,
    );
    for (const operation of [
      () => invoices.enqueue(p, 'unused', 1, 'FINALIZE', 'unused'),
      () => invoices.enqueue(p, 'unused', 1, 'VALIDATE', 'unused'),
      () => invoices.process('unused', 'unused'),
      () => delivery.enqueue(p, 'unused', {}),
      () => delivery.process('unused', 'unused'),
      () => delivery.receipt('', '', ''),
      () => incoming.receive(p, Buffer.from('x'), 'invoice.xml', 'unused'),
      () => incoming.approve(p, 'unused', 'unused', true),
    ])
      await expect(operation()).rejects.toBeInstanceOf(
        CapabilityUnavailableError,
      );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it('SMTP absence cannot return a sent result; adding secure SMTP restores only email', async () => {
    configure();
    await expect(
      emailProvider().send({
        id: 'fixture',
        recipient: 'fixture@erechno.de',
        subject: '',
        message: '',
        senderName: '',
        replyTo: 'fixture@erechno.de',
        attachments: [],
      }),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);
    vi.stubEnv('SMTP_URL', 'smtps://fixture:fixture@smtp.provider.dev:465');
    vi.stubEnv('MAIL_FROM', 'mail@erechno.de');
    expect(runtimeCapabilities().transactionalEmail).toBe(true);
    expect(runtimeCapabilities().invoiceDelivery).toBe(false);
  });
  it('blocks email-dependent authentication routes without blocking verified sign-in', () => {
    expect(authenticationRequiresEmail('/sign-up/email')).toBe(true);
    expect(authenticationRequiresEmail('/request-password-reset')).toBe(true);
    expect(authenticationRequiresEmail('/send-verification-email')).toBe(true);
    expect(authenticationRequiresEmail('/sign-in/email')).toBe(false);
  });
  it('never permits a persistent worker on Vercel', () => {
    expect(() => validateProduction(beta, 'worker')).toThrow(
      'persistent worker',
    );
  });
});
