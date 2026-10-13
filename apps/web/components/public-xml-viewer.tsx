'use client';
import { useState } from 'react';
type View = { format: string; fields: [string, string][]; lines: string[] };
const UBL = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const CII = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
function readXml(text: string): View {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error(
      'Dateien mit DTD oder Entitätsdefinitionen werden nicht geöffnet.',
    );
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror'))
    throw new Error('Die Datei enthält kein lesbares XML.');
  const root = document.documentElement;
  const ubl = root.localName === 'Invoice' && root.namespaceURI === UBL;
  const cii =
    root.localName === 'CrossIndustryInvoice' && root.namespaceURI === CII;
  if (!ubl && !cii)
    throw new Error(
      'Bitte wählen Sie eine UBL-Invoice- oder CII-Rechnungsdatei. PDF-Dateien werden hier nicht gelesen.',
    );
  if (root.getElementsByTagName('*').length > 30000)
    throw new Error('Die XML-Struktur ist zu groß.');
  const child = (node: Element | undefined, name: string) =>
    node
      ? Array.from(node.children).find(
          (e) => e.localName === name && e.namespaceURI?.startsWith('urn:'),
        )
      : undefined;
  const path = (node: Element | undefined, ...names: string[]) =>
    names.reduce(child, node);
  const value = (node: Element | undefined) =>
    (node?.textContent ?? '').trim().slice(0, 500);
  const context = cii ? child(root, 'ExchangedDocument') : root;
  const transaction = child(root, 'SupplyChainTradeTransaction');
  const settlement = child(transaction, 'ApplicableHeaderTradeSettlement');
  const agreement = child(transaction, 'ApplicableHeaderTradeAgreement');
  const fields: [string, string][] = [
    ['Rechnungsnummer', value(child(context, 'ID'))],
    [
      'Datum',
      value(
        ubl
          ? child(root, 'IssueDate')
          : path(context, 'IssueDateTime', 'DateTimeString'),
      ),
    ],
    [
      'Verkäufer',
      value(
        ubl
          ? (path(
              root,
              'AccountingSupplierParty',
              'Party',
              'PartyLegalEntity',
              'RegistrationName',
            ) ??
              path(
                root,
                'AccountingSupplierParty',
                'Party',
                'PartyName',
                'Name',
              ))
          : path(agreement, 'SellerTradeParty', 'Name'),
      ),
    ],
    [
      'Käufer',
      value(
        ubl
          ? (path(
              root,
              'AccountingCustomerParty',
              'Party',
              'PartyLegalEntity',
              'RegistrationName',
            ) ??
              path(
                root,
                'AccountingCustomerParty',
                'Party',
                'PartyName',
                'Name',
              ))
          : path(agreement, 'BuyerTradeParty', 'Name'),
      ),
    ],
    [
      'Währung',
      value(
        ubl
          ? child(root, 'DocumentCurrencyCode')
          : child(settlement, 'InvoiceCurrencyCode'),
      ),
    ],
    [
      'Zahlbetrag',
      value(
        ubl
          ? path(root, 'LegalMonetaryTotal', 'PayableAmount')
          : path(
              settlement,
              'SpecifiedTradeSettlementHeaderMonetarySummation',
              'DuePayableAmount',
            ),
      ),
    ],
  ];
  const lineRoot = ubl ? root : transaction;
  const lines = Array.from(lineRoot?.children ?? [])
    .filter(
      (e) =>
        e.localName ===
        (ubl ? 'InvoiceLine' : 'IncludedSupplyChainTradeLineItem'),
    )
    .slice(0, 100)
    .map((line) =>
      value(
        ubl
          ? path(line, 'Item', 'Name')
          : path(line, 'SpecifiedTradeProduct', 'Name'),
      ),
    );
  return { format: ubl ? 'UBL' : 'CII', fields, lines };
}
export function PublicXmlViewer() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel" aria-label="Lokaler XML-Viewer">
      <label htmlFor="xml-file">XML-Rechnung auswählen (maximal 2 MB)</label>
      <input
        id="xml-file"
        type="file"
        accept=".xml,application/xml,text/xml"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          setView(null);
          setError('');
          if (!file) return;
          setBusy(true);
          try {
            if (file.size > 2 * 1024 * 1024)
              throw new Error(
                'Bitte wählen Sie eine Datei mit höchstens 2 MB.',
              );
            setView(readXml(await file.text()));
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : 'Die Datei konnte nicht geöffnet werden.',
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <p className="muted">
        Die Datei bleibt im Browser. Keine Übertragung an ERechno. Anzeige ist
        keine Validierung.
      </p>
      <div aria-live="polite">
        {busy && <p>Datei wird gelesen …</p>}
        {error && <p role="alert">{error}</p>}
        {view && (
          <>
            <h2>Rechnungsdaten ({view.format})</h2>
            <dl>
              {view.fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || 'Nicht gefunden'}</dd>
                </div>
              ))}
            </dl>
            <h3>Leistungen (erste 100 Positionen)</h3>
            <ul>
              {view.lines.map((line, i) => (
                <li key={i}>{line || 'Ohne Bezeichnung'}</li>
              ))}
            </ul>
            <button
              className="button button-outline"
              onClick={() => setView(null)}
            >
              Anzeige löschen
            </button>
          </>
        )}
      </div>
    </section>
  );
}
