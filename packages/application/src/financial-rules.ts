import Decimal from 'decimal.js';
export const TIMEZONE = 'Europe/Berlin';
export function localDay(now: Date, timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
  );
}
// Calendar ordinals, not elapsed UTC hours: DST never changes a business-day count.
const ordinal = (day: string) => {
  if (!validDay(day)) throw new Error('INVALID_CALENDAR_DAY');
  return Date.parse(`${day}T12:00:00Z`) / 86400000;
};
export const daysBetween = (a: string, b: string) => ordinal(b) - ordinal(a);
export const addDays = (day: string, count: number) =>
  new Date((ordinal(day) + count) * 86400000).toISOString().slice(0, 10);
export type Fact = {
  id: string;
  kind: 'invoice' | 'incoming';
  number: string;
  amount: string | null;
  currency: string;
  issueDay: string;
  dueDay: string | null;
  paidDay: string | null;
  settled: boolean;
  issued: boolean;
  customerId: string | null;
  validationFailed: boolean;
  needsReview: boolean;
  processingFailed: boolean;
  deliveryFailed: boolean;
  deliveryReason: string | null;
  supplierKey: string | null;
  supplierName: string;
  hash: string | null;
  revision: number;
  approved: boolean;
  discountDay: string | null;
  discountRate: string | null;
  discountBase: string | null;
  duplicateOf: string | null;
};
export type Candidate = {
  rule: string;
  version: string;
  severity: 'INFO' | 'ATTENTION' | 'WARNING' | 'CRITICAL';
  title: string;
  reason: string;
  recommendation: string;
  facts: Record<string, string | number | boolean | null>;
  amount: string | null;
  dueDay: string | null;
  mandatory: boolean;
  relatedId: string | null;
};
export type Rule = {
  id: string;
  version: string;
  requires: readonly string[];
  evaluate: (fact: Fact, today: string) => Candidate | null;
};
const money = (v: string | null) =>
  v !== null && /^\d{1,16}(\.\d{1,2})?$/.test(v) && new Decimal(v).gte(0);
export function discountSaving(f: Fact) {
  return f.discountBase && f.discountRate
    ? new Decimal(f.discountBase)
        .mul(f.discountRate)
        .div(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2)
    : null;
}
function candidate(
  rule: string,
  f: Fact,
  title: string,
  reason: string,
  recommendation: string,
  severity: Candidate['severity'],
  mandatory = false,
): Candidate {
  return {
    rule,
    version: '1',
    severity,
    title,
    reason,
    recommendation,
    mandatory,
    facts: {
      number: f.number,
      amount: f.amount,
      currency: f.currency,
      dueDay: f.dueDay,
      revision: f.revision,
    },
    amount: f.currency === 'EUR' ? f.amount : null,
    dueDay: f.dueDay,
    relatedId: null,
  };
}
export const RULES: readonly Rule[] = [
  {
    id: 'INVOICE_OVERDUE',
    version: '1',
    requires: ['issued', 'dueDay', 'settled'],
    evaluate: (f, today) =>
      f.kind === 'invoice' &&
      f.issued &&
      !f.settled &&
      f.dueDay &&
      f.dueDay < today
        ? candidate(
            'INVOICE_OVERDUE',
            f,
            `Rechnung seit ${daysBetween(f.dueDay, today)} Tagen überfällig`,
            `Rechnung ${f.number} war am ${f.dueDay} fällig und ist weiterhin als offen erfasst. Ohne Bankanbindung ist ein Zahlungseingang nicht automatisch bekannt.`,
            'Zahlungseingang abgleichen und gegebenenfalls Kontakt mit dem Kunden aufnehmen.',
            daysBetween(f.dueDay, today) >= 30 ? 'CRITICAL' : 'WARNING',
          )
        : null,
  },
  {
    id: 'PAYMENT_DUE_SOON',
    version: '1',
    requires: ['dueDay', 'settled', 'approved'],
    evaluate: (f, today) =>
      !f.settled &&
      f.dueDay &&
      f.dueDay >= today &&
      daysBetween(today, f.dueDay) <= 7 &&
      (f.kind === 'invoice' ? f.issued : f.approved && !f.duplicateOf)
        ? candidate(
            'PAYMENT_DUE_SOON',
            f,
            f.kind === 'invoice'
              ? 'Eine Kundenzahlung wird bald fällig'
              : 'Eine Lieferantenrechnung wird bald fällig',
            `Rechnung ${f.number} hat die bekannte Zahlungsfrist ${f.dueDay}.`,
            f.kind === 'invoice'
              ? 'Zahlungseingang im Blick behalten.'
              : 'Betrag und Frist prüfen; eine Zahlung außerhalb von ERechno selbst veranlassen.',
            'ATTENTION',
          )
        : null,
  },
  {
    id: 'PAYABLE_OVERDUE',
    version: '1',
    requires: ['approved', 'dueDay', 'settled'],
    evaluate: (f, today) =>
      f.kind === 'incoming' &&
      f.approved &&
      !f.settled &&
      !f.duplicateOf &&
      f.dueDay &&
      f.dueDay < today
        ? candidate(
            'PAYABLE_OVERDUE',
            f,
            'Zahlungsfrist einer Lieferantenrechnung überschritten',
            `Rechnung ${f.number} war am ${f.dueDay} fällig. Es wurde keine Zahlung bestätigt.`,
            'Prüfen, ob bereits gezahlt wurde. ERechno löst keine Bankzahlung aus.',
            'WARNING',
          )
        : null,
  },
  {
    id: 'EINVOICE_VALIDATION_FAILED',
    version: '1',
    requires: ['currentRevisionValidation'],
    evaluate: (f) =>
      f.validationFailed
        ? candidate(
            'EINVOICE_VALIDATION_FAILED',
            f,
            'Rechnungsprüfung braucht eine Korrektur',
            `Für Rechnung ${f.number} liegt ein fehlgeschlagenes Prüfergebnis der aktuellen Fassung vor.`,
            'Prüfhinweise ansehen und die Quelldaten berichtigen. Ausgestellte Originale bleiben unverändert.',
            'WARNING',
            true,
          )
        : null,
  },
  {
    id: 'DELIVERY_FAILED',
    version: '1',
    requires: ['latestDelivery'],
    evaluate: (f) =>
      f.deliveryFailed
        ? {
            ...candidate(
              'DELIVERY_FAILED',
              f,
              'Rechnung konnte nicht zugestellt werden',
              `Der letzte Versand von ${f.number} ist fehlgeschlagen${f.deliveryReason ? ` (${f.deliveryReason})` : ''}.`,
              'Empfänger prüfen und einen erneuten Versand über die bestehende Versandvorschau bestätigen.',
              'WARNING',
            ),
            facts: { number: f.number, deliveryReason: f.deliveryReason },
          }
        : null,
  },
  {
    id: 'INVOICE_REQUIRES_REVIEW',
    version: '1',
    requires: ['incomingReviewState'],
    evaluate: (f) =>
      f.kind === 'incoming' && f.needsReview
        ? candidate(
            'INVOICE_REQUIRES_REVIEW',
            f,
            'Eingangsrechnung wartet auf Ihre Durchsicht',
            `Rechnung ${f.number || 'ohne erkannte Nummer'} wurde verarbeitet, aber noch nicht freigegeben.`,
            'Original, Geschäftsvorgang und Prüfergebnis abgleichen und die Freigabe bewusst bestätigen.',
            'ATTENTION',
            true,
          )
        : null,
  },
  {
    id: 'PROCESSING_FAILED',
    version: '1',
    requires: ['processingState'],
    evaluate: (f) =>
      f.processingFailed
        ? candidate(
            'PROCESSING_FAILED',
            f,
            'Dokumentverarbeitung wurde unterbrochen',
            `Für ${f.number || 'dieses Dokument'} ist die Verarbeitung als fehlgeschlagen erfasst.`,
            'Verarbeitungsdetails öffnen und den vorhandenen Prüfvorgang gezielt erneut starten.',
            'WARNING',
            true,
          )
        : null,
  },
  {
    id: 'SKONTO_EXPIRING',
    version: '1',
    requires: ['userConfirmedDiscountTerms'],
    evaluate: (f, today) =>
      f.kind === 'incoming' &&
      f.approved &&
      !f.settled &&
      !f.duplicateOf &&
      f.discountDay &&
      f.discountDay >= today &&
      daysBetween(today, f.discountDay) <= 3 &&
      money(f.discountBase) &&
      f.discountRate
        ? {
            ...candidate(
              'SKONTO_EXPIRING',
              f,
              'Eine bestätigte Skontofrist läuft bald ab',
              `${f.discountRate} % von ${f.discountBase} EUR ergeben ${discountSaving(f)} EUR. Diese Bedingungen wurden von Ihnen bestätigt; Frist: ${f.discountDay}.`,
              'Skontobedingungen im Original prüfen und gegebenenfalls eine Zahlung selbst vorbereiten.',
              'ATTENTION',
            ),
            amount: discountSaving(f),
            dueDay: f.discountDay,
            facts: {
              base: f.discountBase,
              rate: f.discountRate,
              saving: discountSaving(f),
              deadline: f.discountDay,
            },
          }
        : null,
  },
];
export function evaluate(f: Fact, today: string) {
  return RULES.flatMap((r) => {
    const c = r.evaluate(f, today);
    return c ? [c] : [];
  });
}
export function duplicateSignal(
  a: Fact,
  b: Fact,
):
  | 'EXACT_DUPLICATE'
  | 'HIGH_PROBABILITY_DUPLICATE'
  | 'POSSIBLE_DUPLICATE'
  | null {
  if (a.kind !== 'incoming' || b.kind !== 'incoming' || a.id === b.id)
    return null;
  if (a.hash && a.hash === b.hash) return 'EXACT_DUPLICATE';
  if (
    !a.supplierKey ||
    a.supplierKey !== b.supplierKey ||
    !a.number ||
    a.number !== b.number ||
    a.currency !== b.currency
  )
    return null;
  if (
    a.issueDay === b.issueDay &&
    money(a.amount) &&
    money(b.amount) &&
    new Decimal(a.amount!).eq(b.amount!)
  )
    return 'HIGH_PROBABILITY_DUPLICATE';
  return 'POSSIBLE_DUPLICATE';
}
export function forecast(facts: readonly Fact[], today: string) {
  const sum = (kind: Fact['kind'], days: number) =>
    facts
      .filter(
        (f) =>
          f.kind === kind &&
          !f.settled &&
          !f.duplicateOf &&
          (kind === 'invoice' ? f.issued : f.approved) &&
          f.currency === 'EUR' &&
          money(f.amount) &&
          f.dueDay &&
          f.dueDay >= today &&
          f.dueDay <= addDays(today, days),
      )
      .reduce((v, f) => v.plus(f.amount!), new Decimal(0))
      .toFixed(2);
  const receivables7 = sum('invoice', 7),
    receivables30 = sum('invoice', 30),
    payables7 = sum('incoming', 7),
    payables30 = sum('incoming', 30);
  const overdue = facts
    .filter(
      (f) =>
        f.kind === 'invoice' &&
        f.issued &&
        !f.settled &&
        f.dueDay &&
        f.dueDay < today &&
        f.currency === 'EUR' &&
        money(f.amount),
    )
    .reduce((v, f) => v.plus(f.amount!), new Decimal(0))
    .toFixed(2);
  return {
    receivables7,
    receivables30,
    payables7,
    payables30,
    net7: new Decimal(receivables7).minus(payables7).toFixed(2),
    net30: new Decimal(receivables30).minus(payables30).toFixed(2),
    overdue,
    balanceKnown: false as const,
  };
}
export function paymentBehavior(facts: readonly Fact[]) {
  const paid = facts
    .filter(
      (f) =>
        f.kind === 'invoice' &&
        f.paidDay &&
        validDay(f.issueDay) &&
        validDay(f.paidDay),
    )
    .sort((a, b) => b.paidDay!.localeCompare(a.paidDay!));
  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const elapsed = paid
    .map((f) => daysBetween(f.issueDay, f.paidDay!))
    .sort((a, b) => a - b);
  const late = paid
    .filter((f) => f.dueDay)
    .map((f) => Math.max(0, daysBetween(f.dueDay!, f.paidDay!)));
  const recent = avg(
    paid.slice(0, 3).map((f) => daysBetween(f.issueDay, f.paidDay!)),
  );
  const previous = avg(
    paid.slice(3).map((f) => daysBetween(f.issueDay, f.paidDay!)),
  );
  return {
    sampleSize: paid.length,
    averageDays: avg(elapsed),
    medianDays: elapsed.length
      ? (elapsed[Math.floor((elapsed.length - 1) / 2)]! +
          elapsed[Math.floor(elapsed.length / 2)]!) /
        2
      : null,
    averageDaysLate: avg(late),
    percentLate: late.length
      ? (100 * late.filter((v) => v > 0).length) / late.length
      : null,
    recentAverage: recent,
    previousAverage: previous,
    deteriorating:
      paid.length >= 6 &&
      recent !== null &&
      previous !== null &&
      recent - previous >= 7,
  };
}
export function expenseAnomaly(
  f: Fact,
  peers: readonly Fact[],
): Candidate | null {
  if (
    f.kind !== 'incoming' ||
    !f.approved ||
    f.duplicateOf ||
    f.currency !== 'EUR' ||
    !money(f.amount) ||
    !f.supplierKey
  )
    return null;
  const amounts = peers
    .filter(
      (p) =>
        p.id !== f.id &&
        p.approved &&
        !p.duplicateOf &&
        p.supplierKey === f.supplierKey &&
        p.currency === 'EUR' &&
        p.issueDay < f.issueDay &&
        money(p.amount),
    )
    .map((p) => new Decimal(p.amount!))
    .sort((a, b) => a.comparedTo(b));
  if (amounts.length < 5) return null;
  const median = amounts[Math.floor(amounts.length / 2)]!;
  if (median.lte(0) || new Decimal(f.amount!).lt(median.mul(3))) return null;
  return {
    ...candidate(
      'LARGE_UNUSUAL_EXPENSE',
      f,
      'Lieferantenrechnung deutlich höher als bisher',
      `Der Betrag ist mindestens dreimal so hoch wie der mittlere Betrag von ${amounts.length} früheren bestätigten Rechnungen desselben Lieferanten. Ein höherer Betrag kann berechtigt sein.`,
      'Leistung und Betrag im Original vergleichen.',
      'ATTENTION',
    ),
    facts: {
      number: f.number,
      amount: f.amount,
      median: median.toFixed(2),
      sampleSize: amounts.length,
    },
  };
}
export function financialIntent(raw: string) {
  const text = raw.trim().toLowerCase();
  if (
    /^(was (ist |braucht ).*(heute|aufmerksamkeit)|was ist heute wichtig|heute)$/.test(
      text,
    )
  )
    return {
      href: '/autopilot',
      label: 'Was heute Aufmerksamkeit braucht',
      detail: 'Gespeicherte Hinweise Ihrer Organisation',
      kind: 'Autopilot',
    };
  if (/^(überfällige rechnungen|offene überfällige rechnungen)$/.test(text))
    return {
      href: '/invoices/attention',
      label: 'Überfällige Rechnungen und Prüfhinweise',
      detail: 'Rechnungen mit Handlungsbedarf',
      kind: 'Autopilot',
    };
  if (/^(autopilot einstellungen|automatisierung einstellen)$/.test(text))
    return {
      href: '/autopilot/settings',
      label: 'Autopilot einstellen',
      detail: 'Arbeitsweise und erlaubte Vorbereitungen',
      kind: 'Autopilot',
    };
  return null;
}
