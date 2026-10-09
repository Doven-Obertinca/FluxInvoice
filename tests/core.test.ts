import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import Decimal from 'decimal.js';
import {
  calculate,
  validate,
  transition,
  assertEditable,
  formatNumber,
  displayMoney,
  invoiceInputSchema,
  type InvoiceInput,
} from '@flux/invoice-core';
import { canonical, digest, verifyChain } from '@flux/audit';
import { can } from '@flux/auth';
import { companySchema, environmentSchema } from '@flux/shared';
export const input: InvoiceInput = {
  customerId: 'f88c43e8-782d-43ec-8da4-c8cc322cf8d8',
  issueDate: '2026-10-06',
  dueDate: '2026-10-20',
  serviceDate: '2026-10-01',
  currency: 'EUR',
  buyerReference: '',
  notes: 'Grüße & <Leistung>',
  lines: [
    {
      description: 'Beratung',
      quantity: '1',
      unitPrice: '100',
      unit: 'HUR',
      vatRate: '19',
      allowance: '0',
      charge: '0',
    },
  ],
  adjustments: [],
};
describe('exact decimal calculations', () => {
  it('computes 19 and 7 percent independently', () => {
    const totals = calculate({
      ...input,
      lines: [input.lines[0]!, { ...input.lines[0]!, vatRate: '7' }],
    });
    expect(totals.net).toBe('200.00');
    expect(totals.tax).toBe('26.00');
    expect(totals.payable).toBe('226.00');
  });
  it('rounds half up before tax grouping', () => {
    expect(
      calculate({
        ...input,
        lines: [{ ...input.lines[0]!, unitPrice: '0.005' }],
      }).net,
    ).toBe('0.01');
    expect(
      calculate({
        ...input,
        lines: [{ ...input.lines[0]!, unitPrice: '0.03' }],
      }).tax,
    ).toBe('0.01');
  });
  it('groups tax rather than summing rounded line tax', () => {
    const l = { ...input.lines[0]!, unitPrice: '0.03' };
    expect(calculate({ ...input, lines: [l, l] }).tax).toBe('0.01');
  });
  it('handles fractional quantities and price precision', () => {
    expect(
      calculate({
        ...input,
        lines: [
          { ...input.lines[0]!, quantity: '0.333333', unitPrice: '10.123456' },
        ],
      }).net,
    ).toBe('3.37');
  });
  it('applies line and document allowances by tax group', () => {
    const totals = calculate({
      ...input,
      lines: [{ ...input.lines[0]!, allowance: '10', charge: '5' }],
      adjustments: [
        { kind: 'ALLOWANCE', reason: 'Treue', amount: '5', vatRate: '19' },
      ],
    });
    expect(totals.payable).toBe('107.10');
  });
  it('rejects negative lines and groups', () => {
    expect(() =>
      calculate({
        ...input,
        lines: [{ ...input.lines[0]!, allowance: '101' }],
      }),
    ).toThrow();
    expect(() =>
      calculate({
        ...input,
        adjustments: [
          { kind: 'ALLOWANCE', reason: 'Rabat', amount: '101', vatRate: '19' },
        ],
      }),
    ).toThrow();
  });
  it('rejects floats, exponents, client totals and unsupported taxes', () => {
    expect(invoiceInputSchema.safeParse({ ...input, net: '1' }).success).toBe(
      false,
    );
    for (const value of [0.1, '1e3', '-1', 'NaN', '0.1234567'])
      expect(
        invoiceInputSchema.safeParse({
          ...input,
          lines: [{ ...input.lines[0]!, unitPrice: value }],
        }).success,
      ).toBe(false);
    expect(
      invoiceInputSchema.safeParse({
        ...input,
        lines: [{ ...input.lines[0]!, vatRate: '0' }],
      }).success,
    ).toBe(false);
  });
  it('rejects invalid calendar dates', () => {
    expect(validate({ ...input, issueDate: '2026-02-30' })).not.toHaveLength(0);
  });
  it('maps issues to actionable fields', () => {
    expect(validate({ ...input, dueDate: '2026-01-01' })[0]?.fieldPath).toBe(
      'dueDate',
    );
  });
  it('formats without converting money to native numbers', () =>
    expect(displayMoney('9999999999999.99')).toBe('9.999.999.999.999,99 €'));
  it('preserves sum invariants across random line combinations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            cents: fc.integer({ min: 0, max: 10000000 }),
            qty: fc.integer({ min: 1, max: 10000 }),
            vat: fc.constantFrom('19' as const, '7' as const),
          }),
          { minLength: 1, maxLength: 100 },
        ),
        (rows) => {
          const invoice = {
            ...input,
            lines: rows.map((r) => ({
              ...input.lines[0]!,
              unitPrice: new Decimal(r.cents).div(100).toFixed(2),
              quantity: new Decimal(r.qty).div(100).toFixed(2),
              vatRate: r.vat,
            })),
          };
          const totals = calculate(invoice);
          expect(new Decimal(totals.net).plus(totals.tax).toFixed(2)).toBe(
            totals.payable,
          );
          expect(calculate(invoice)).toEqual(totals);
          expect(
            totals.lines
              .reduce((s, l) => s.plus(l.net), new Decimal(0))
              .toFixed(2),
          ).toBe(totals.net);
        },
      ),
      { numRuns: 300 },
    );
  });
});
describe('lifecycle and numbering', () => {
  it('permits explicit transitions only', () => {
    expect(transition('DRAFT', 'VALIDATED')).toBe('VALIDATED');
    expect(() => transition('DRAFT', 'PAID')).toThrow();
    expect(() => transition('FINALIZED', 'DRAFT')).toThrow();
    expect(() => transition('PAID', 'CREDITED')).toThrow();
    expect(() => assertEditable('FINALIZED')).toThrow();
  });
  it('supports prefixes and unbounded sequence display', () => {
    expect(formatNumber('NL-', 2026, 123n)).toBe('NL-2026-000123');
    expect(formatNumber('', 2026, 1000000n)).toBe('2026-1000000');
    expect(() => formatNumber('', 2026, 0n)).toThrow();
  });
});
describe('security primitives', () => {
  it('canonicalizes keys and rejects ambiguous values', () => {
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
    expect(() => canonical({ a: undefined })).toThrow();
    expect(() => canonical(NaN)).toThrow();
    expect(verifyChain([])).toBe(true);
    expect(verifyChain([], 'a')).toBe(false);
  });
  it('enforces role grants', () => {
    expect(can('VIEWER', 'invoice:write')).toBe(false);
    expect(can('ACCOUNTANT', 'company:write')).toBe(false);
    expect(can('OWNER', 'company:write')).toBe(true);
  });
  it('requires secure production configuration', () => {
    expect(
      environmentSchema.safeParse({
        APP_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/flux',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        BETTER_AUTH_URL: 'http://localhost',
      }).success,
    ).toBe(false);
  });
  it('verifies IBAN checksum', () => {
    const company = {
      name: 'Test',
      email: 'test@example.test',
      vatId: '',
      taxNumber: '',
      address: {
        line1: 'Test 1',
        city: 'Bonn',
        postalCode: '53111',
        country: 'DE',
      },
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      numberPrefix: '',
    };
    expect(companySchema.safeParse(company).success).toBe(true);
    expect(
      companySchema.safeParse({ ...company, iban: 'DE00370400440532013000' })
        .success,
    ).toBe(false);
  });
});

it('unresolved document suggestions cannot pass the domain boundary', () => {
  for (const field of ['quantity', 'unitPrice', 'unit', 'vatRate']) {
    const unresolved = {
      ...input,
      lines: [{ ...input.lines[0], [field]: '' }],
    };
    expect(invoiceInputSchema.safeParse(unresolved).success).toBe(false);
    expect(
      validate(unresolved).some(
        (issue) => issue.fieldPath === `lines.0.${field}`,
      ),
    ).toBe(true);
  }
  for (const field of ['dueDate', 'serviceDate']) {
    expect(
      invoiceInputSchema.safeParse({ ...input, [field]: '' }).success,
    ).toBe(false);
  }
});
