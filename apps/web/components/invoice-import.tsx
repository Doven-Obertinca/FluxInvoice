'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileUp, ScanLine, ArrowRight } from 'lucide-react';
import {
  extractSuggestions,
  parseQr,
  MAX_TEXT,
  type PaymentDetails,
  type Suggestions,
} from '@flux/document-import';
import { displayMoney } from '@flux/invoice-core';
import { readDocument, type ReadDocument } from '../lib/document-reader';
import { searchCustomers } from '../lib/actions';
import {
  InvoiceEditor,
  type InvoiceEditorProps,
  type InvoiceFormInput,
} from './invoice-editor';
import { QrCamera } from './qr-camera';
import { Button } from './ui/button';

type Props = Pick<InvoiceEditorProps, 'customers' | 'seller'> & {
  today: string;
};
export function InvoiceImport({ customers, seller, today }: Props) {
  const [mode, setMode] = useState<'letter' | 'qr'>('letter');
  const [result, setResult] = useState<ReadDocument | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<InvoiceFormInput | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function applyText(value: string) {
    const extracted = extractSuggestions(value);
    setSuggestions(extracted);
    setPayment(null);
    setConfirmed(false);
    const matches = customers.filter(
      (c) =>
        c.name.toLocaleLowerCase('de') ===
        extracted.customerName.toLocaleLowerCase('de'),
    );
    setCustomerId(matches.length === 1 ? matches[0]!.id : '');
  }
  function selectQr(code: string) {
    const parsed = parseQr(code);
    setConfirmed(false);
    setError('');
    setCustomerId('');
    if (parsed.kind === 'unsupported') {
      setSuggestions(null);
      setPayment(null);
      setText(code);
      setError(parsed.message);
      return;
    }
    if (parsed.kind === 'payment') {
      setPayment(parsed.payment);
      setSuggestions(null);
      setText(code);
    } else {
      setText(parsed.text);
      applyText(parsed.text);
    }
  }
  async function read(file: File | undefined) {
    if (!file) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    setMessage('Datei wird vorbereitet …');
    setResult(null);
    setSuggestions(null);
    setPayment(null);
    setConfirmed(false);
    setCustomerId('');
    setText('');
    setPreviewPage(0);
    setFilename(file.name);
    try {
      const read = await readDocument(file, mode, active.signal, (message) => {
        if (controller.current === active) setMessage(message);
      });
      if (controller.current !== active || active.signal.aborted) return;
      setResult(read);
      setText(read.text);
      if (mode === 'qr' && read.codes.length === 1) selectQr(read.codes[0]!);
      else if (mode === 'letter' && read.text.trim()) applyText(read.text);
      else if (!read.codes.length)
        setError(
          mode === 'qr'
            ? 'Kein QR-Code gefunden. Bitte einen schärferen Ausschnitt auswählen.'
            : 'Kein lesbarer Text gefunden. Bitte ein schärferes Foto oder eine andere PDF-Datei verwenden.',
        );
      setMessage(
        `${read.pages} ${read.pages === 1 ? 'Seite gelesen' : 'Seiten gelesen'}${read.usedOcr ? ' · Texterkennung verwendet' : ''}.`,
      );
      requestAnimationFrame(() => heading.current?.focus());
    } catch (cause) {
      if (controller.current !== active) return;
      setError(
        active.signal.aborted
          ? 'Lesen abgebrochen.'
          : cause instanceof Error
            ? cause.message
            : 'Die Datei konnte nicht gelesen werden. Bitte erneut versuchen.',
      );
      setMessage('');
    } finally {
      if (controller.current === active) setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function findCustomers() {
    setSearching(true);
    try {
      const response = await searchCustomers(query);
      if (response.ok) {
        setCustomerOptions((old) => [
          ...new Map(
            [...old, ...response.value].map((c) => [c.id, c]),
          ).values(),
        ]);
        setMessage(
          response.value.length
            ? `${response.value.length} Kunden gefunden. Bitte unten auswählen.`
            : 'Keine passenden Kunden gefunden.',
        );
      } else setError(response.message);
    } finally {
      setSearching(false);
    }
  }
  const sourceGross = payment?.amount || suggestions?.gross || '';
  if (draft)
    return (
      <>
        <div className="notice import-summary">
          <strong>
            Aus {filename || 'QR-Code'} vorbereitet · noch nicht gespeichert
          </strong>
          <p>
            Prüfen Sie Kunde, Leistungsdatum, alle Positionen und Umsatzsteuer.
            Die Quelldatei wird nicht archiviert.
          </p>
          {!suggestions?.lines.length && (
            <p>
              Keine vollständigen Positionen übernommen. Menge, Einheit,
              Nettopreis und Umsatzsteuer bleiben leer, bis Sie diese Angaben
              selbst ergänzen.
            </p>
          )}
          <details>
            <summary>Erkannten Quelltext anzeigen</summary>
            <pre className="source-text">{text}</pre>
          </details>
        </div>
        <InvoiceEditor
          customers={customerOptions}
          seller={seller}
          initial={draft}
          importedGross={sourceGross}
          requireExplicitValues
        />
      </>
    );
  return (
    <>
      <Link href="/invoices" className="back-link">
        ← Rechnungen
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">VON DER VORLAGE ZUM ENTWURF</p>
          <h1>Aus Dokument erstellen</h1>
          <p className="muted">
            PDF, Foto oder QR-Code einlesen und daraus einen Rechnungsentwurf
            vorbereiten.
          </p>
        </div>
      </div>
      <section className="panel import-upload" aria-labelledby="source-heading">
        <h2 id="source-heading">1. Vorlage auswählen</h2>
        <fieldset disabled={busy} className="import-modes">
          <legend className="sr-only">Art der Vorlage</legend>
          <label>
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'letter'}
              onChange={() => setMode('letter')}
            />
            <FileUp size={18} /> PDF / Foto
          </label>
          <label>
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'qr'}
              onChange={() => setMode('qr')}
            />
            <ScanLine size={18} /> QR-Code
          </label>
        </fieldset>
        <p className="muted">
          {mode === 'letter'
            ? 'Deutsche Druckschrift, Text-PDFs und gescannte Seiten. Erkennung kann Fehler enthalten.'
            : 'EPC/SEPA-Zahlungscodes (UTF-8) und beschriftete Rechnungsangaben. QR-Links werden nicht geöffnet.'}
        </p>
        <label className="field">
          Foto oder PDF auswählen
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={busy}
            onChange={(event) => void read(event.target.files?.[0])}
            aria-describedby="import-limits"
          />
        </label>
        <p className="field-hint" id="import-limits">
          JPEG, PNG, WebP oder PDF · maximal 10 MB, 5 Seiten und 24 Megapixel.
          Fotos bitte gerade und gut beleuchtet aufnehmen.
        </p>
        <p className="muted">
          Die Datei bleibt auf Ihrem Gerät. Nur die von Ihnen gespeicherten
          Rechnungsangaben werden an ERechno übertragen.
        </p>
        {busy && (
          <Button variant="outline" onClick={() => controller.current?.abort()}>
            Lesen abbrechen
          </Button>
        )}
        {mode === 'qr' && !busy && (
          <QrCamera
            disabled={busy}
            onRead={(codes) => {
              setError('');
              setMessage('QR-Code gelesen.');
              setConfirmed(false);
              setCustomerId('');
              setText('');
              setFilename('Kamera-QR');
              setPreviewPage(0);
              setResult({
                text: '',
                codes,
                previews: [],
                pages: 1,
                usedOcr: false,
              });
              if (codes.length === 1) selectQr(codes[0]!);
              else {
                setPayment(null);
                setSuggestions(null);
              }
              requestAnimationFrame(() => heading.current?.focus());
            }}
          />
        )}
      </section>
      <div role="status" aria-live="polite">
        {message && <p className="notice">{message}</p>}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="import-review" aria-labelledby="review-heading">
          <div className="panel import-source">
            <div className="section-heading">
              <h2>Original</h2>
              <span className="muted import-filename">{filename}</span>
            </div>
            {result.previews.length > 0 && (
              <>
                {result.previews.length > 1 && (
                  <label className="field">
                    Seite ansehen
                    <select
                      value={previewPage}
                      onChange={(e) => setPreviewPage(Number(e.target.value))}
                    >
                      {result.previews.map((_, i) => (
                        <option key={i} value={i}>
                          Seite {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {/* Local rasterized preview: no remote URLs or active PDF content. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.previews[previewPage]}
                  alt={`Gelesene Vorlage, Seite ${previewPage + 1}`}
                />
              </>
            )}
            {result.codes.length > 0 && (
              <div className="stack">
                <h3>
                  {result.codes.length} QR-Code
                  {result.codes.length > 1 ? 's' : ''} erkannt
                </h3>
                {result.codes.map((code, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => selectQr(code)}
                  >
                    QR-Code {index + 1} prüfen
                  </Button>
                ))}
                {result.text && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError('');
                      setText(result.text);
                      applyText(result.text);
                    }}
                  >
                    Dokumenttext prüfen
                  </Button>
                )}
              </div>
            )}
            <details open={!result.previews.length}>
              <summary>Erkannter Text / QR-Inhalt</summary>
              <label className="field">
                Quelltext prüfen
                <textarea
                  rows={12}
                  value={text}
                  maxLength={MAX_TEXT}
                  readOnly={!!payment}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSuggestions(null);
                    setConfirmed(false);
                  }}
                />
              </label>
              {!payment && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setError('');
                    applyText(text);
                  }}
                >
                  Textkorrekturen auswerten
                </Button>
              )}
            </details>
          </div>
          <div className="panel import-fields">
            <h2 id="review-heading" ref={heading} tabIndex={-1}>
              2. Angaben prüfen
            </h2>
            {payment ? (
              <>
                <p className="notice">
                  Ein Zahlungs-QR beschreibt den Zahlungsempfänger. Er enthält
                  keine vollständigen Rechnungspositionen oder Umsatzsteuer. Es
                  wird keine Zahlung ausgeführt.
                </p>
                <dl className="import-facts">
                  <dt>Zahlungsempfänger</dt>
                  <dd>{payment.beneficiary}</dd>
                  <dt>IBAN der Quelle</dt>
                  <dd>{payment.iban}</dd>
                  {payment.bic && (
                    <>
                      <dt>BIC</dt>
                      <dd>{payment.bic}</dd>
                    </>
                  )}
                  <dt>Zahlbetrag</dt>
                  <dd>
                    {payment.amount
                      ? displayMoney(payment.amount)
                      : 'Nicht angegeben'}
                  </dd>
                  <dt>Zahlungsreferenz</dt>
                  <dd>{payment.reference || 'Nicht angegeben'}</dd>
                  {payment.information && (
                    <>
                      <dt>Weitere Angaben</dt>
                      <dd>{payment.information}</dd>
                    </>
                  )}
                </dl>
                <p className="muted">
                  Diese Bankdaten werden nicht in Ihre Rechnung übernommen. Ihr
                  Unternehmen bleibt Rechnungsaussteller; Leistungen,
                  Nettopreise und Umsatzsteuer ergänzen Sie selbst.
                </p>
              </>
            ) : suggestions ? (
              <>
                <p className="muted">
                  Vorschläge aus der Vorlage. Vergleichen Sie sie mit dem
                  Original; freie Briefe und komplexe Tabellen müssen
                  möglicherweise manuell ergänzt werden.
                </p>
                <dl className="import-facts">
                  <dt>Kunde laut Text</dt>
                  <dd>
                    {suggestions.customerName || 'Nicht eindeutig erkannt'}
                  </dd>
                  <dt>Kundenreferenz</dt>
                  <dd>{suggestions.buyerReference || 'Nicht erkannt'}</dd>
                  <dt>Leistungsdatum</dt>
                  <dd>
                    {suggestions.serviceDate || 'Bitte im Editor ergänzen'}
                  </dd>
                  <dt>Bruttobetrag der Quelle</dt>
                  <dd>
                    {suggestions.gross
                      ? displayMoney(suggestions.gross)
                      : 'Nicht erkannt'}
                  </dd>
                  {suggestions.sourceNumber && (
                    <>
                      <dt>Nummer der Quelle</dt>
                      <dd>
                        {suggestions.sourceNumber} · wird nicht übernommen
                      </dd>
                    </>
                  )}
                  {suggestions.sourceDate && (
                    <>
                      <dt>Datum der Quelle</dt>
                      <dd>
                        {suggestions.sourceDate} · neue Rechnung erhält heutiges
                        Datum
                      </dd>
                    </>
                  )}
                </dl>
                {suggestions.lines.length > 0 && (
                  <div className="stack">
                    <h3>
                      {suggestions.lines.length}{' '}
                      {suggestions.lines.length === 1
                        ? 'Positionsvorschlag'
                        : 'Positionsvorschläge'}
                    </h3>
                    {suggestions.lines.map((line, i) => (
                      <p className="import-line" key={i}>
                        <strong>{line.description}</strong>
                        <span>
                          {line.quantity} × {displayMoney(line.unitPrice)} netto
                          · {line.vatRate} % USt.
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                {suggestions.warnings.map((warning) => (
                  <p className="notice" key={warning}>
                    {warning}
                  </p>
                ))}
              </>
            ) : (
              <p className="muted">
                Wählen Sie einen erkannten QR-Code oder korrigieren Sie den
                Quelltext.
              </p>
            )}
            {(payment || suggestions) && (
              <div className="stack">
                <h3>Rechnung für Ihren Kunden vorbereiten</h3>
                <p className="muted">
                  Eingangsrechnungen werden hier nicht verbucht. Bereiten Sie
                  nur eine eigene Ausgangsrechnung über Ihre Leistungen vor.
                </p>
                <div className="customer-search">
                  <label className="field">
                    Kunden suchen
                    <input
                      value={query}
                      maxLength={100}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={findCustomers}
                    disabled={searching}
                  >
                    {searching ? 'Suche …' : 'Suchen'}
                  </Button>
                </div>
                <label className="field">
                  Kunde für die neue Rechnung
                  <select
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Bitte bewusst auswählen</option>
                    {customerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Link
                  href="/customers"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Kunden in einem neuen Tab anlegen
                </Link>
                <label className="import-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    Ich habe die Quelle geprüft und möchte eine eigene
                    Ausgangsrechnung für diesen Kunden vorbereiten. Fehlende
                    Angaben ergänze ich im Editor.
                  </span>
                </label>
                <Button
                  disabled={!confirmed || !customerId}
                  onClick={() => {
                    setDraft({
                      customerId,
                      issueDate: today,
                      dueDate: '',
                      serviceDate: suggestions?.serviceDate || '',
                      currency: 'EUR',
                      buyerReference: suggestions?.buyerReference ?? '',
                      notes: '',
                      adjustments: [],
                      lines: suggestions?.lines.length
                        ? suggestions.lines
                        : [
                            {
                              description: '',
                              quantity: '',
                              unitPrice: '',
                              unit: '',
                              vatRate: '',
                              allowance: '0',
                              charge: '0',
                            },
                          ],
                    });
                    window.scrollTo({ top: 0 });
                  }}
                >
                  Geprüfte Angaben im Editor öffnen <ArrowRight size={16} />
                </Button>
                <p className="field-hint">
                  Noch keine Speicherung, Rechnungsnummer oder Finalisierung.
                  Die E-Rechnungsprüfung erfolgt anschließend im normalen
                  Ablauf.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
