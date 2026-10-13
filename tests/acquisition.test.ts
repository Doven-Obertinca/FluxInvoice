import { expect, it } from 'vitest';
import { acquisitionEvent } from '@flux/observability';
it('rejects financial, identifying and arbitrary acquisition payloads at runtime', () => {
  for (const payload of [
    { iban: 'DE89370400440532013000' },
    { name: 'Customer' },
    { invoiceId: 'identifier' },
    { route: '/invoices/private-id' },
    { result: 'arbitrary financial text' },
  ]) {
    expect(() =>
      acquisitionEvent('invoice_finalized', payload as never),
    ).toThrow();
  }
  expect(() =>
    acquisitionEvent('invoice_finalized', { plan: 'FREE', result: 'success' }),
  ).not.toThrow();
});
