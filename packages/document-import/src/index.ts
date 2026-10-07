export { inspectSourceFile, MAX_FILE_BYTES, MAX_IMAGE_PIXELS } from './file';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { lineSchema, type InvoiceLine } from '@flux/invoice-core';

export const MAX_TEXT = 60000;
export interface Suggestions {
  customerName: string;
  buyerReference: string;
  serviceDate: string;
  sourceDate: string;
  sourceNumber: string;
  gross: string;
  lines: InvoiceLine[];
  warnings: string[];
}
export interface PaymentDetails {
  beneficiary: string;
  iban: string;
  bic: string;
  amount: string;
  reference: string;
  information: string;
}
export type QrResult =
  | { kind: 'payment'; payment: PaymentDetails }
  | { kind: 'text'; text: string }
  | { kind: 'unsupported'; message: string };

// German amounts are deliberately not interpreted as floating point numbers.
export function germanDecimal(raw: string): string | null {
  if (raw.length > 40) return null;
  const value = raw.trim().replace(/\s*(?:EUR|€)\s*/gi, '');
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,6})?$/.test(value)) return null;
  return new Decimal(value.replaceAll('.', '').replace(',', '.')).toFixed();
}
function isoDate(raw: string): string {
  const local = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw.trim());
  const value = local
    ? `${local[3]}-${local[2]!.padStart(2, '0')}-${local[1]!.padStart(2, '0')}`
    : raw.trim();
  return z.iso.date().safeParse(value).success ? value : '';
}
export function extractSuggestions(raw: string): Suggestions {
  if (raw.length > MAX_TEXT) throw new Error('Der erkannte Text ist zu lang.');
  const text = raw.replaceAll('\r', '').normalize('NFC');
  const labelled = (names: string) =>
    new RegExp(`^(?:${names})\\s*[:：]\\s*(.+)$`, 'im')
      .exec(text)?.[1]
      ?.trim() ?? '';
  const result: Suggestions = {
    customerName: labelled('Kunde|Rechnungsempfänger|Auftraggeber').slice(
      0,
      200,
    ),
    buyerReference: labelled('Kundenreferenz|Bestellreferenz|Leitweg-ID').slice(
      0,
      200,
    ),
    serviceDate: isoDate(labelled('Leistungsdatum|Lieferdatum')),
    sourceDate: isoDate(labelled('Rechnungsdatum|Datum')),
    sourceNumber: labelled('Rechnungsnummer|Rechnung Nr\\.?').slice(0, 100),
    gross:
      germanDecimal(labelled('Gesamtbetrag|Bruttobetrag|Brutto|Zahlbetrag')) ??
      '',
    lines: [],
    warnings: [],
  };
  // Only explicit net unit prices AND explicit supported tax rates form a suggestion.
  // Arbitrary prose, totals and QR payment amounts never become invented net lines.
  for (const row of text.split('\n')) {
    const labelledLine =
      /^(?:Leistung|Position)\s*:\s*(.+?)\s*\|\s*Menge\s*:\s*([\d.,]+)\s*\|\s*Einheit\s*:\s*(\S+)\s*\|\s*Nettopreis\s*:\s*([\d.,]+)\s*(?:EUR|€)?\s*\|\s*(?:USt|MwSt)\s*:\s*(19|7)\s*%\s*$/i.exec(
        row.trim(),
      );
    const tableLine =
      /^(.+?)\s+(\d+(?:,\d+)?)\s+(Stk\.?|Stück|Std\.?|Stunden?|Tage?)\s+([\d.,]+)\s*(?:EUR|€)?\s+netto\s+(19|7)\s*%\s*$/i.exec(
        row.trim(),
      );
    const match = labelledLine ?? tableLine;
    if (!match) continue;
    const unit = /^(?:stk\.?|stück|c62)$/i.test(match[3]!)
      ? 'C62'
      : /^(?:std\.?|stunden?|hur)$/i.test(match[3]!)
        ? 'HUR'
        : /^(?:tage?|day)$/i.test(match[3]!)
          ? 'DAY'
          : null;
    const candidate = lineSchema.safeParse({
      description: match[1],
      quantity: germanDecimal(match[2]!),
      unitPrice: germanDecimal(match[4]!),
      unit,
      vatRate: match[5],
      allowance: '0',
      charge: '0',
    });
    if (candidate.success && new Decimal(candidate.data.unitPrice).gt(0))
      result.lines.push(candidate.data);
    if (result.lines.length > 200)
      throw new Error(
        'Zu viele Positionen. Bitte teilen Sie das Dokument auf.',
      );
  }
  if (!result.lines.length)
    result.warnings.push(
      'Keine vollständigen Positionen mit Nettopreis und Umsatzsteuer erkannt. Bitte ergänzen Sie Ihre Leistungen.',
    );
  if (
    /reverse\s*charge|steuerfrei|§\s*13b|innergemeinschaftlich|gutschrift/i.test(
      text,
    )
  )
    result.warnings.push(
      'Das Dokument nennt eine Steuerart oder Gutschrift, die dieser Rechnungsablauf nicht unterstützt. Prüfen Sie, ob eine normale deutsche Rechnung zutrifft.',
    );
  if (/rabatt|nachlass|zuschlag|skonto/i.test(text))
    result.warnings.push(
      'Nachlässe oder Zuschläge im Dokument müssen im Rechnungseditor gesondert geprüft und ergänzt werden.',
    );
  return result;
}
function mod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}
export function validIban(iban: string): boolean {
  return (
    /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) &&
    (iban.startsWith('DE') ? iban.length === 22 : true) &&
    mod97(iban.slice(4) + iban.slice(0, 4)) === 1
  );
}
export function parseQr(raw: string): QrResult {
  const unsupported = (message: string): QrResult => ({
    kind: 'unsupported',
    message,
  });
  if (raw.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw))
    return unsupported(
      'Der QR-Inhalt ist zu groß oder enthält ungültige Zeichen.',
    );
  const text = raw.replaceAll('\r\n', '\n');
  if (!text.startsWith('BCD\n')) {
    if (
      /^\s*(?!(?:Kunde|Rechnungsempfänger|Leistung|Position|Rechnungsnummer|Kundenreferenz)\s*:)(?:[a-z][a-z0-9+.-]*:|www\.)/i.test(
        text,
      )
    )
      return unsupported(
        'Dieser QR-Code enthält einen Link. Links werden nicht geöffnet. Laden Sie das eigentliche Dokument hoch.',
      );
    if (/^SPC\n/.test(text))
      return unsupported(
        'Schweizer QR-Rechnungen werden noch nicht unterstützt.',
      );
    if (
      !/^(?:Kunde|Rechnungsempfänger|Leistung|Position|Rechnungsnummer|Kundenreferenz)\s*:/im.test(
        text,
      )
    )
      return unsupported(
        'Kein unterstützter Zahlungs- oder Rechnungstext erkannt. Unterstützt werden EPC/SEPA und beschriftete Rechnungsangaben.',
      );
    return { kind: 'text', text };
  }
  const parts = text.split('\n');
  const [
    tag,
    version,
    charset,
    transfer,
    bic = '',
    beneficiary = '',
    iban = '',
    amount = '',
    purpose = '',
    structured = '',
    reference = '',
    information = '',
  ] = parts;
  // Initial support is explicitly UTF-8 EPC, not every payment QR dialect/encoding.
  if (
    tag !== 'BCD' ||
    !['001', '002'].includes(version ?? '') ||
    charset !== '1' ||
    transfer !== 'SCT'
  )
    return unsupported(
      'Unterstützt werden EPC-Version 001/002 mit UTF-8 und SEPA-Überweisung.',
    );
  if (
    new TextEncoder().encode(text).length > 331 ||
    parts.length < 7 ||
    parts.length > 12 ||
    !beneficiary.trim() ||
    beneficiary.length > 70 ||
    !validIban(iban) ||
    (bic !== '' && !/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic)) ||
    (version === '001' && !bic) ||
    (purpose !== '' && !/^[A-Z]{4}$/.test(purpose)) ||
    structured.length > 35 ||
    reference.length > 140 ||
    information.length > 70 ||
    (structured !== '' && reference !== '') ||
    (structured.startsWith('RF') &&
      (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(structured) ||
        mod97(structured.slice(4) + structured.slice(0, 4)) !== 1))
  )
    return unsupported(
      'Der SEPA-Code enthält unvollständige oder ungültige Zahlungsangaben. Bitte prüfen Sie das Original.',
    );
  let value = '';
  if (amount) {
    if (!/^EUR\d{1,9}(?:\.\d{1,2})?$/.test(amount))
      return unsupported('Der QR-Betrag ist kein unterstützter EUR-Betrag.');
    const decimal = new Decimal(amount.slice(3));
    if (decimal.lt('0.01') || decimal.gt('999999999.99'))
      return unsupported(
        'Der QR-Betrag liegt außerhalb des zulässigen Bereichs.',
      );
    value = decimal.toFixed(2);
  }
  return {
    kind: 'payment',
    payment: {
      beneficiary,
      iban,
      bic,
      amount: value,
      reference: structured || reference,
      information,
    },
  };
}
