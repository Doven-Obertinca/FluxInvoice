import Decimal from 'decimal.js';
import { z } from 'zod';
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const decimalSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
const date = z.iso.date();
export const lineSchema = z
  .object({
    description: z.string().trim().min(1).max(1000),
    // Only invoke Decimal after the syntax check succeeds (empty/OCR input is untrusted).
    quantity: decimalSchema.pipe(z.string().refine((v) => new D(v).gt(0))),
    unitPrice: decimalSchema,
    unit: z.enum(['C62', 'HUR', 'DAY']),
    vatRate: z.enum(['19', '7']),
    allowance: decimalSchema.default('0'),
    charge: decimalSchema.default('0'),
  })
  .strict();
export const adjustmentSchema = z
  .object({
    reason: z.string().trim().min(1).max(200),
    amount: decimalSchema,
    vatRate: z.enum(['19', '7']),
    kind: z.enum(['ALLOWANCE', 'CHARGE']),
  })
  .strict();
export const invoiceInputSchema = z
  .object({
    customerId: z.uuid(),
    issueDate: date,
    dueDate: date,
    serviceDate: date,
    currency: z.literal('EUR'),
    buyerReference: z.string().max(200),
    notes: z.string().max(2000),
    lines: z.array(lineSchema).min(1).max(200),
    adjustments: z.array(adjustmentSchema).max(20).default([]),
  })
  .strict()
  .refine((v) => v.dueDate >= v.issueDate, {
    path: ['dueDate'],
    message: 'Fälligkeit darf nicht vor Rechnungsdatum liegen.',
  });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type InvoiceLine = z.infer<typeof lineSchema>;
export interface ValidationIssue {
  code: string;
  ruleId: string;
  severity: 'ERROR' | 'WARNING';
  fieldPath: string;
  message: string;
  source: 'DOMAIN';
  profile: 'FLUX_DRAFT';
  rulesetVersion: '1';
}
export interface Totals {
  lines: { net: string; vatRate: '19' | '7' }[];
  taxes: { rate: '19' | '7'; taxable: string; tax: string }[];
  lineNet: string;
  allowances: string;
  charges: string;
  net: string;
  tax: string;
  payable: string;
}
const money = (v: Decimal) => v.toDecimalPlaces(2).toFixed(2);
export function calculate(input: InvoiceInput): Totals {
  const parsed = invoiceInputSchema.parse(input);
  const groups = new Map<'19' | '7', Decimal>();
  const lines = parsed.lines.map((l) => {
    const net = new D(l.quantity)
      .times(l.unitPrice)
      .toDecimalPlaces(2)
      .minus(new D(l.allowance).toDecimalPlaces(2))
      .plus(new D(l.charge).toDecimalPlaces(2));
    if (net.isNegative()) throw new Error('Line allowance exceeds line amount');
    groups.set(l.vatRate, (groups.get(l.vatRate) ?? new D(0)).plus(net));
    return { net: money(net), vatRate: l.vatRate };
  });
  let allowances = new D(0),
    charges = new D(0);
  for (const a of parsed.adjustments) {
    const amount = new D(a.amount).toDecimalPlaces(2);
    if (a.kind === 'ALLOWANCE') allowances = allowances.plus(amount);
    else charges = charges.plus(amount);
    groups.set(
      a.vatRate,
      (groups.get(a.vatRate) ?? new D(0)).plus(
        a.kind === 'ALLOWANCE' ? amount.negated() : amount,
      ),
    );
  }
  const taxes = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rate, taxable]) => {
      if (taxable.isNegative())
        throw new Error('Allowance exceeds taxable group');
      return {
        rate,
        taxable: money(taxable),
        tax: money(taxable.times(rate).div(100)),
      };
    });
  const lineNet = lines.reduce((s, l) => s.plus(l.net), new D(0));
  const net = lineNet.minus(allowances).plus(charges);
  const tax = taxes.reduce((s, t) => s.plus(t.tax), new D(0));
  if (net.plus(tax).gte('10000000000000000'))
    throw new Error('Invoice amount exceeds supported range');
  return {
    lines,
    taxes,
    lineNet: money(lineNet),
    allowances: money(allowances),
    charges: money(charges),
    net: money(net),
    tax: money(tax),
    payable: money(net.plus(tax)),
  };
}
export function validate(input: unknown): ValidationIssue[] {
  const result = invoiceInputSchema.safeParse(input);
  if (!result.success)
    return result.error.issues.map((i) => ({
      code: 'INVALID_INPUT',
      ruleId: 'FLUX-INPUT',
      severity: 'ERROR',
      fieldPath: i.path.join('.'),
      message: validationMessage(
        i.path.map(String).join('.'),
        i.code === 'custom' ? i.message : undefined,
      ),
      source: 'DOMAIN',
      profile: 'FLUX_DRAFT',
      rulesetVersion: '1',
    }));
  try {
    calculate(result.data);
    return [];
  } catch {
    return [
      {
        code: 'INVALID_TOTALS',
        ruleId: 'FLUX-TOTALS',
        severity: 'ERROR',
        fieldPath: 'lines',
        message:
          'Nachlässe oder Summen liegen außerhalb des zulässigen Bereichs.',
        source: 'DOMAIN',
        profile: 'FLUX_DRAFT',
        rulesetVersion: '1',
      },
    ];
  }
}
export const statuses = [
  'DRAFT',
  'VALIDATED',
  'FINALIZED',
  'SENT',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'CREDITED',
] as const;
export type InvoiceStatus = (typeof statuses)[number];
const transitions: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['VALIDATED', 'CANCELLED'],
  VALIDATED: ['DRAFT', 'FINALIZED', 'CANCELLED'],
  FINALIZED: ['SENT'],
  SENT: ['PAID', 'OVERDUE'],
  OVERDUE: ['PAID'],
  PAID: [],
  CANCELLED: [],
  CREDITED: [],
};
export function transition(from: InvoiceStatus, to: InvoiceStatus) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid transition ${from} → ${to}`);
  return to;
}
export function assertEditable(status: InvoiceStatus) {
  if (status !== 'DRAFT' && status !== 'VALIDATED')
    throw new Error('Invoice content is immutable');
}
export function formatNumber(prefix: string, year: number, sequence: bigint) {
  if (
    !/^[A-Z0-9-]{0,20}$/.test(prefix) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 9999 ||
    sequence < 1n
  )
    throw new Error('Invalid numbering configuration');
  return `${prefix}${year}-${sequence.toString().padStart(6, '0')}`;
}
export function displayMoney(value: string) {
  const [whole, fraction] = new D(value).toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction} €`;
}

export const roundMoney = (value: string) => money(new D(value));
export const normalizeDecimal = (value: string) => new D(value).toFixed();

function validationMessage(path: string, custom?: string): string {
  const field = path.split('.').at(-1) ?? '';
  const messages: Record<string, string> = {
    customerId: 'Wählen Sie einen Kunden aus.',
    description: 'Beschreiben Sie die Leistung (maximal 1.000 Zeichen).',
    quantity:
      'Geben Sie eine positive Menge mit höchstens sechs Nachkommastellen ein.',
    unitPrice: 'Geben Sie einen gültigen Nettopreis ein.',
    unit: 'Wählen Sie die Einheit für diese Leistung aus.',
    vatRate: 'Wählen Sie den zutreffenden Umsatzsteuersatz aus.',
    allowance: 'Geben Sie einen gültigen Nachlass ein.',
    charge: 'Geben Sie einen gültigen Zuschlag ein.',
    issueDate: 'Geben Sie ein gültiges Rechnungsdatum ein.',
    serviceDate: 'Geben Sie ein gültiges Leistungsdatum ein.',
    dueDate: custom ?? 'Geben Sie ein gültiges Fälligkeitsdatum ein.',
    lines: 'Fügen Sie mindestens eine und höchstens 200 Positionen hinzu.',
    notes: 'Der Hinweis darf maximal 2.000 Zeichen enthalten.',
  };
  return messages[field] ?? 'Prüfen Sie die Eingabe in diesem Feld.';
}
