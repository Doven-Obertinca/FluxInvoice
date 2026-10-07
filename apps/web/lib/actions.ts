'use server';
import { randomUUID } from 'node:crypto';
import { ZodError, z } from 'zod';
import { revalidatePath } from 'next/cache';
import { AppError } from '@flux/shared';
import { logOperation } from '@flux/observability';
import { principal, requireUser, service } from './server';
export type Result<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      message: string;
      fields: Record<string, string>;
      requestId: string;
    };
async function perform<T>(
  operation: string,
  fn: () => Promise<T>,
  requestId: string,
): Promise<Result<T>> {
  const started = performance.now();
  try {
    const value = await fn();
    logOperation({
      requestId,
      operation,
      result: 'success',
      durationMs: Math.round(performance.now() - started),
    });
    return { ok: true, value };
  } catch (error) {
    logOperation({
      requestId,
      operation,
      result: 'failed',
      durationMs: Math.round(performance.now() - started),
      errorCode:
        error instanceof AppError
          ? error.code
          : error instanceof ZodError
            ? 'VALIDATION'
            : 'INTERNAL',
    });
    if (error instanceof ZodError)
      return {
        ok: false,
        message: 'Bitte prüfen Sie Ihre Eingaben.',
        fields: Object.fromEntries(
          error.issues.map((i) => {
            const path = i.path.join('.');
            const labels: Record<string, string> = {
              name: 'Bitte geben Sie den Firmennamen an.',
              email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.',
              'address.line1': 'Bitte geben Sie Straße und Hausnummer an.',
              'address.city': 'Bitte geben Sie den Ort an.',
              'address.postalCode': 'Bitte prüfen Sie die Postleitzahl.',
              vatId: 'Bitte verwenden Sie DE gefolgt von neun Ziffern.',
              iban: 'Bitte geben Sie eine gültige deutsche IBAN an.',
              bic: 'Bitte geben Sie eine BIC mit 8 oder 11 Zeichen an.',
              numberPrefix:
                'Nur Großbuchstaben, Zahlen und Bindestriche sind erlaubt.',
              contactName: 'Bitte geben Sie einen Rechnungskontakt an.',
              contactPhone: 'Bitte prüfen Sie die Telefonnummer.',
            };
            return [path, labels[path] ?? 'Bitte prüfen Sie diese Angabe.'];
          }),
        ),
        requestId,
      };
    if (error instanceof AppError)
      return { ok: false, message: error.message, fields: {}, requestId };
    if (error instanceof Error && error.message === 'NEXT_REDIRECT')
      throw error;
    return {
      ok: false,
      message:
        'Die Aktion konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
      fields: {},
      requestId,
    };
  }
}
export async function onboard(input: unknown) {
  const user = await requireUser();
  const requestId = randomUUID();
  return perform(
    'organization.create',
    () => service.createOrganization(user.id, input, requestId),
    requestId,
  );
}
export async function saveCompany(input: unknown) {
  const p = await principal();
  return perform(
    'company.update',
    async () => {
      await service.updateCompany(p, input);
      revalidatePath('/settings/company');
      return true;
    },
    p.requestId,
  );
}
export async function saveCustomer(input: unknown, id?: string) {
  const p = await principal();
  return perform(
    'customer.save',
    async () => {
      const result = id
        ? (await service.updateCustomer(p, id, input), id)
        : await service.createCustomer(p, input);
      revalidatePath('/customers');
      return result;
    },
    p.requestId,
  );
}
export async function saveInvoice(input: unknown, options: unknown) {
  const p = await principal();
  return perform(
    'invoice.save',
    async () => {
      const parsed = z
        .object({
          id: z.uuid().optional(),
          revision: z.number().int().positive().optional(),
          idempotencyKey: z.uuid(),
        })
        .strict()
        .parse(options);
      const id = await service.saveInvoice(p, input, {
        idempotencyKey: parsed.idempotencyKey,
        ...(parsed.id ? { id: parsed.id } : {}),
        ...(parsed.revision ? { revision: parsed.revision } : {}),
      });
      revalidatePath('/invoices');
      revalidatePath('/dashboard');
      revalidatePath(`/invoices/${id}`);
      return id;
    },
    p.requestId,
  );
}
export async function validateInvoice(id: string, revision: number) {
  const p = await principal();
  return perform(
    'invoice.validate',
    async () => {
      const issues = await service.validateInvoice(
        p,
        z.uuid().parse(id),
        z.number().int().positive().parse(revision),
      );
      revalidatePath(`/invoices/${id}`);
      revalidatePath('/invoices');
      return issues;
    },
    p.requestId,
  );
}

export async function searchCustomers(query: string) {
  const p = await principal();
  return perform(
    'customer.search',
    async () =>
      (await service.listCustomers(p, 1, z.string().max(100).parse(query))).map(
        (c) => ({ id: c.id, name: c.name }),
      ),
    p.requestId,
  );
}

export async function requestEinvoice(
  id: string,
  revision: number,
  kind: 'VALIDATE' | 'FINALIZE',
  key: string,
) {
  const p = await principal();
  return perform(
    'einvoice.request',
    async () => {
      const { einvoice } = await import('./server');
      const job = await einvoice.enqueue(p, id, revision, kind, key);
      revalidatePath(`/invoices/${id}`);
      return job;
    },
    p.requestId,
  );
}
