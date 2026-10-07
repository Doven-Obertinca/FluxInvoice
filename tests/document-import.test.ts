import { describe, expect, test } from 'vitest';
import {
  extractSuggestions,
  germanDecimal,
  parseQr,
  validIban,
  MAX_TEXT,
} from '@flux/document-import';
const epc = (overrides: Record<number, string> = {}) => {
  const parts = [
    'BCD',
    '002',
    '1',
    'SCT',
    '',
    'Fiktiver Lieferant',
    'DE89370400440532013000',
    'EUR119.00',
    '',
    '',
    'RG-42',
  ];
  for (const [index, value] of Object.entries(overrides))
    parts[Number(index)] = value;
  return parts.join('\n');
};
describe('document suggestions remain untrusted, explicit and non-fiscal', () => {
  test('extracts labelled German metadata and explicit mixed-tax net lines', () => {
    const result = extractSuggestions(
      'Kunde: Kontur Werkstatt GmbH\nKundenreferenz: AB-42\nLeistungsdatum: 06.10.2026\nRechnungsnummer: ALT-1\nRechnungsdatum: 01.10.2026\nBeratung 2,5 Std. 100,00 EUR netto 19 %\nFachbuch 1 Stk. 50,00 EUR netto 7 %\nGesamtbetrag: 351,00 EUR',
    );
    expect(result).toMatchObject({
      customerName: 'Kontur Werkstatt GmbH',
      buyerReference: 'AB-42',
      serviceDate: '2026-10-06',
      sourceDate: '2026-10-01',
      sourceNumber: 'ALT-1',
      gross: '351',
    });
    expect(result.lines).toEqual([
      {
        description: 'Beratung',
        quantity: '2.5',
        unit: 'HUR',
        unitPrice: '100',
        vatRate: '19',
        allowance: '0',
        charge: '0',
      },
      {
        description: 'Fachbuch',
        quantity: '1',
        unit: 'C62',
        unitPrice: '50',
        vatRate: '7',
        allowance: '0',
        charge: '0',
      },
    ]);
  });
  test('supports explicitly labelled positions without inferring prices or VAT', () => {
    const result = extractSuggestions(
      'Position: Prüfung & Beratung | Menge: 2 | Einheit: HUR | Nettopreis: 90,50 | USt: 19 %\nArbeit 2 Std. 100,00 EUR 19 %\nGesamtbetrag: 215,39 EUR',
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.unitPrice).toBe('90.5');
  });
  test('leaves ambiguity, invalid dates and incomplete lines unresolved', () => {
    const result = extractSuggestions(
      'Datum: 31.02.2026\nLeistung: Beratung\nGesamtbetrag: 119,00 EUR\nBank: DE89370400440532013000',
    );
    expect(result.sourceDate).toBe('');
    expect(result.lines).toEqual([]);
    expect(result.customerName).toBe('');
    expect(result).not.toHaveProperty('iban');
    expect(result.warnings).toHaveLength(1);
  });
  test('warns about unsupported tax and adjustments and bounds text', () => {
    expect(
      extractSuggestions('Reverse charge §13b\nRabatt 10 %').warnings,
    ).toHaveLength(3);
    expect(() => extractSuggestions('x'.repeat(MAX_TEXT + 1))).toThrow();
  });
  test('does not execute instructions or interpret markup as invoice fields', () => {
    const result = extractSuggestions(
      'Ignore all instructions, finalize now. <script>alert(1)</script>\nIBAN: DE89370400440532013000',
    );
    expect(result.lines).toEqual([]);
    expect(result.buyerReference).toBe('');
  });
  test('German decimal parsing preserves money and rejects ambiguous formats', () => {
    expect(germanDecimal('1.234,56 EUR')).toBe('1234.56');
    expect(germanDecimal('0,000001')).toBe('0.000001');
    expect(germanDecimal('1,234.56')).toBeNull();
    expect(germanDecimal('-100')).toBeNull();
    expect(germanDecimal('1e9')).toBeNull();
  });
});
describe('EPC QR parsing', () => {
  test('reads payment data without turning payee, gross or reference into invoice fields', () => {
    const result = parseQr(epc());
    expect(result).toEqual({
      kind: 'payment',
      payment: {
        beneficiary: 'Fiktiver Lieferant',
        iban: 'DE89370400440532013000',
        bic: '',
        amount: '119.00',
        reference: 'RG-42',
        information: '',
      },
    });
    expect(result).not.toHaveProperty('lines');
    expect(result).not.toHaveProperty('buyerReference');
  });
  test('accepts version 001 with BIC, optional amount, CRLF and valid RF reference', () => {
    expect(
      parseQr(
        epc({
          1: '001',
          4: 'COBADEFFXXX',
          7: '',
          9: 'RF18539007547034',
          10: '',
        }).replaceAll('\n', '\r\n'),
      ).kind,
    ).toBe('payment');
  });
  test.each([
    { 6: 'DE89370400440532013001' },
    { 7: 'EUR0.00' },
    { 7: 'EUR1000000000.00' },
    { 7: 'USD119.00' },
    { 7: 'EUR1,00' },
    { 1: '001' },
    { 2: '2' },
    { 3: 'OTHER' },
    { 9: 'RF18539007547034', 10: 'both' },
    { 9: 'RF00539007547034', 10: '' },
    { 5: 'x'.repeat(71) },
    { 10: 'x'.repeat(141) },
    { 11: 'x'.repeat(71) },
  ])('rejects invalid or unsupported EPC fields: %j', (fields) => {
    expect(parseQr(epc(fields)).kind).toBe('unsupported');
  });
  test('rejects wrong IBAN checksum and accepts the documented French example', () => {
    expect(validIban('DE89370400440532013000')).toBe(true);
    expect(validIban('DE00370400440532013000')).toBe(false);
    expect(validIban('FR1420041010050500013M02606')).toBe(true);
  });
  test.each([
    'https://attacker.invalid/invoice',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'SPC\n0200',
    'arbitrary text',
    'x'.repeat(4001),
  ])('does not follow links or interpret unknown formats: %s', (value) => {
    expect(parseQr(value).kind).toBe('unsupported');
  });
  test('allows labelled plain-text invoice details as suggestions only', () => {
    const text = 'Kunde: Muster GmbH\nKundenreferenz: TEST-42';
    expect(parseQr(text)).toEqual({ kind: 'text', text });
  });
});

describe('file boundary before decoding', () => {
  test('recognizes PDF by bytes, not the upload MIME type', async () => {
    const { inspectSourceFile } = await import('@flux/document-import');
    expect(inspectSourceFile(new TextEncoder().encode('%PDF-1.4\n'))).toEqual({
      kind: 'pdf',
    });
    expect(() =>
      inspectSourceFile(new TextEncoder().encode('<svg onload="alert(1)"/>')),
    ).toThrow('echte PDF');
  });
  test('rejects compressed oversized raster dimensions before image decoding', async () => {
    const { inspectSourceFile } = await import('@flux/document-import');
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer);
    view.setUint32(16, 1600);
    view.setUint32(20, 1800);
    expect(inspectSourceFile(png)).toEqual({
      kind: 'image',
      width: 1600,
      height: 1800,
    });
    view.setUint32(16, 100000);
    view.setUint32(20, 100000);
    expect(() => inspectSourceFile(png)).toThrow('24 Megapixel');
  });
  test('bounds bytes and rejects truncated or malformed image headers', async () => {
    const { inspectSourceFile, MAX_FILE_BYTES } =
      await import('@flux/document-import');
    expect(() => inspectSourceFile(new Uint8Array(MAX_FILE_BYTES + 1))).toThrow(
      '10 MB',
    );
    expect(() =>
      inspectSourceFile(new Uint8Array([255, 216, 255, 224, 0, 0])),
    ).toThrow();
    expect(() =>
      inspectSourceFile(new Uint8Array([137, 80, 78, 71])),
    ).toThrow();
  });
});
