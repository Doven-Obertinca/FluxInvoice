import { it, expect } from 'vitest';
import {
  RULES,
  evaluate,
  localDay,
  daysBetween,
  addDays,
  validDay,
  forecast,
  paymentBehavior,
  duplicateSignal,
  expenseAnomaly,
  financialIntent,
  type Fact,
} from '../packages/application/src/financial-rules';
export const fact = (extra: Partial<Fact> = {}): Fact => ({
  id: '1',
  kind: 'invoice',
  number: 'R1',
  amount: '119.00',
  currency: 'EUR',
  issueDay: '2026-09-01',
  dueDay: '2026-10-01',
  paidDay: null,
  settled: false,
  issued: true,
  customerId: null,
  validationFailed: false,
  needsReview: false,
  processingFailed: false,
  deliveryFailed: false,
  deliveryReason: null,
  supplierKey: null,
  supplierName: '',
  hash: null,
  revision: 1,
  approved: false,
  discountDay: null,
  discountRate: null,
  discountBase: null,
  duplicateOf: null,
  ...extra,
});
it('uses Berlin business dates through midnight and both DST changes', () => {
  expect(localDay(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
  expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  expect(validDay('2026-02-30')).toBe(false);
});
it.each(RULES.map((r) => [r.id, r]))(
  'evaluates %s deterministically',
  (_id, rule) => {
    const f = fact({
      kind:
        rule.id === 'INVOICE_OVERDUE' ||
        rule.id === 'DELIVERY_FAILED' ||
        rule.id === 'EINVOICE_VALIDATION_FAILED'
          ? 'invoice'
          : 'incoming',
      approved: true,
      needsReview: true,
      validationFailed: true,
      processingFailed: true,
      deliveryFailed: true,
      discountDay: '2026-10-13',
      discountRate: '2',
      discountBase: '100.00',
      dueDay: rule.id === 'PAYMENT_DUE_SOON' ? '2026-10-13' : '2026-10-01',
    });
    expect(rule.evaluate(f, '2026-10-12')?.rule).toBe(rule.id);
    expect(rule.evaluate(f, '2026-10-12')).toEqual(
      rule.evaluate(f, '2026-10-12'),
    );
  },
);
it('does not confuse processing metadata with bank payment knowledge', () => {
  expect(
    evaluate(fact({ settled: true }), '2026-10-12').some(
      (a) => a.rule === 'INVOICE_OVERDUE',
    ),
  ).toBe(false);
  expect(
    evaluate(fact({ dueDay: '2026-10-12' }), '2026-10-12').some(
      (a) => a.rule === 'INVOICE_OVERDUE',
    ),
  ).toBe(false);
  expect(
    evaluate(fact({ kind: 'incoming', approved: false }), '2026-10-12').some(
      (a) => a.rule === 'PAYABLE_OVERDUE',
    ),
  ).toBe(false);
});
it('forecasts exact decimal EUR amounts and excludes duplicates, unknown currencies and settled facts', () => {
  const f = fact({ dueDay: '2026-10-13', amount: '0.10' });
  const report = forecast(
    [
      f,
      { ...f, id: '2', amount: '0.20' },
      fact({
        kind: 'incoming',
        approved: true,
        dueDay: '2026-10-13',
        amount: '0.05',
      }),
      { ...f, id: '3', settled: true },
      { ...f, id: '4', currency: 'USD' },
      { ...f, id: '5', duplicateOf: '1' },
    ],
    '2026-10-12',
  );
  expect(report.receivables7).toBe('0.30');
  expect(report.net7).toBe('0.25');
  expect(report.balanceKnown).toBe(false);
});
it('requires real paid dates and enough samples for deterioration', () => {
  expect(paymentBehavior([fact()]).sampleSize).toBe(0);
  const samples = Array.from({ length: 6 }, (_, i) =>
    fact({
      id: String(i),
      paidDay: i < 3 ? `2026-10-${12 - i}` : `2026-09-0${12 - i}`,
    }),
  );
  expect(paymentBehavior(samples).deteriorating).toBe(true);
  expect(paymentBehavior(samples.slice(0, 3)).deteriorating).toBe(false);
});
it('explains duplicate signals without treating them as confirmed duplicates', () => {
  const a = fact({ kind: 'incoming', supplierKey: 'DE123', hash: 'abc' });
  expect(duplicateSignal(a, { ...a, id: '2' })).toBe('EXACT_DUPLICATE');
  expect(duplicateSignal(a, { ...a, id: '2', hash: 'def' })).toBe(
    'HIGH_PROBABILITY_DUPLICATE',
  );
  expect(
    duplicateSignal(a, { ...a, id: '2', hash: 'def', amount: '12.00' }),
  ).toBe('POSSIBLE_DUPLICATE');
  expect(
    duplicateSignal(a, { ...a, id: '2', hash: 'def', supplierKey: 'OTHER' }),
  ).toBeNull();
});
it('only flags unusually high expenses with a sufficient supplier baseline', () => {
  const f = fact({
    kind: 'incoming',
    approved: true,
    supplierKey: 'supplier',
    amount: '300.00',
    issueDay: '2026-10-01',
  });
  const peers = Array.from({ length: 5 }, (_, i) =>
    fact({
      id: String(i + 2),
      kind: 'incoming',
      approved: true,
      supplierKey: 'supplier',
      amount: '100.00',
    }),
  );
  expect(expenseAnomaly(f, peers)?.facts.sampleSize).toBe(5);
  expect(expenseAnomaly(f, peers.slice(0, 4))).toBeNull();
});
it('command intents select fixed safe routes and never execute arbitrary text', () => {
  expect(financialIntent('was ist heute wichtig')?.href).toBe('/autopilot');
  expect(financialIntent('delete all invoices')).toBeNull();
});
it('only allows automatic reversible preparation; financial actions require confirmation', async () => {
  const { FINANCIAL_OPERATIONS } =
    await import('../packages/application/src/financial-execution');
  for (const operation of Object.values(FINANCIAL_OPERATIONS)) {
    if (operation.automatic) expect(operation.safety).toBe('REVERSIBLE');
    if (operation.safety === 'FINANCIAL') {
      expect(operation.confirmation).toBe(true);
      expect(operation.automatic).toBe(false);
    }
  }
});
