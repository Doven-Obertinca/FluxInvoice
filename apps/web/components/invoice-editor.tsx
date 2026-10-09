'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import Link from 'next/link';
import {
  calculate,
  displayMoney,
  normalizeDecimal,
  invoiceInputSchema,
  validate,
  type InvoiceInput,
  type InvoiceLine,
} from '@flux/invoice-core';
import { saveInvoice, requestEinvoice, searchCustomers } from '../lib/actions';
import { Button } from './ui/button';
import { useInvoiceDirty } from './invoice-workspace';
import { businessTerms } from '../../../packages/einvoice/src/mapping';
interface Party {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
  email: string;
  iban?: string | null;
}
// Editable form state can contain unknown values; only the domain schema may
// turn it into an InvoiceInput. Imported values never receive guessed VAT/units.
export type InvoiceFormInput = Omit<InvoiceInput, 'lines'> & {
  lines: Array<
    Omit<InvoiceLine, 'unit' | 'vatRate'> & {
      unit: InvoiceLine['unit'] | '';
      vatRate: InvoiceLine['vatRate'] | '';
    }
  >;
};
export interface InvoiceEditorProps {
  requireExplicitValues?: boolean;
  importedGross?: string;
  customers: { id: string; name: string }[];
  seller: Party;
  buyer?: Party;
  initial: InvoiceFormInput;
  id?: string;
  revision?: number;
  status?: string;
  frozen?: boolean;
  number?: string | undefined;
}
export function InvoiceEditor({
  customers,
  seller,
  buyer,
  initial,
  id,
  revision,
  status = 'DRAFT',
  frozen = false,
  number,
  importedGross,
  requireExplicitValues = false,
}: InvoiceEditorProps) {
  const workspace = useInvoiceDirty();
  const [input, setInput] = useState(initial);
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [customerSearch, setCustomerSearch] = useState('');
  const [tab, setTab] = useState<'preview' | 'validation' | 'data'>('preview');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const baseId = useId();
  const issues = validate(input);
  let totals: ReturnType<typeof calculate> | null = null;
  try {
    const parsed = invoiceInputSchema.safeParse(input);
    if (parsed.success) totals = calculate(parsed.data);
  } catch {}
  const editable = !frozen && (status === 'DRAFT' || status === 'VALIDATED');
  const update = <K extends keyof InvoiceFormInput>(
    field: K,
    value: InvoiceFormInput[K],
  ) => {
    setInput((old) => ({ ...old, [field]: value }));
    setDirty(true);
    workspace.setDirty(true);
    setKey(crypto.randomUUID());
  };
  const updateLine = (
    index: number,
    field: keyof InvoiceLine,
    value: string,
  ) => {
    update(
      'lines',
      input.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  };
  const save = () =>
    start(async () => {
      const r = await saveInvoice(input, {
        idempotencyKey: key,
        ...(id ? { id, revision } : {}),
      });
      if (r.ok) {
        // Keep issuance disabled until the refreshed revision remounts the workspace.
        setMessage('Entwurf gespeichert.');
        router.push(`/invoices/${r.value}`);
        router.refresh();
      } else setMessage(`${r.message} ${Object.values(r.fields).join(' ')}`);
    });
  return (
    <>
      <Link className="back-link" href="/invoices">
        <ArrowLeft size={14} /> Rechnungen
      </Link>
      {!id && !requireExplicitValues && (
        <Link className="import-entry" href="/invoices/import">
          Aus Dokument erstellen →
        </Link>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {number ? 'AUSGESTELLTE RECHNUNG' : 'RECHNUNGSENTWURF'}
          </p>
          <h1>{number ?? (id ? 'Rechnung bearbeiten' : 'Neue Rechnung')}</h1>
          <p className="muted">
            {status === 'VALIDATED' && !dirty
              ? 'Gespeicherter Entwurf · noch nicht finalisiert'
              : number
                ? 'Unveränderbarer Rechnungsstand'
                : 'Entwurf · noch keine ausgestellte Rechnung'}
          </p>
        </div>
        <Button
          onClick={save}
          disabled={
            pending || !editable || (requireExplicitValues && issues.length > 0)
          }
        >
          <Save size={16} />
          {pending ? 'Wird gespeichert …' : 'Entwurf speichern'}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {message && <p className="notice">{message}</p>}
      </div>
      {requireExplicitValues && issues.length > 0 && (
        <p className="notice">
          Noch nicht vollständig: Ergänzen Sie fehlende Daten, Mengen,
          Einheiten, Nettopreise und Umsatzsteuer. Unter „Prüfung“ finden Sie
          die betroffenen Felder. Erst danach können Sie den Entwurf speichern.
        </p>
      )}
      {importedGross && (
        <p className="notice" role="status">
          Bruttobetrag der Quelle: {displayMoney(importedGross)}.{' '}
          {totals &&
          normalizeDecimal(totals.payable) === normalizeDecimal(importedGross)
            ? 'Der berechnete Gesamtbetrag stimmt überein; Positionen und Steuer bitte trotzdem prüfen.'
            : 'Der Entwurf weicht davon ab oder ist noch unvollständig. Prüfen Sie Nettopreise, Umsatzsteuer und alle Positionen vor dem Speichern.'}
        </p>
      )}
      {totals && (
        <div className="editor-total-bar">
          <span>{input.lines.length} Positionen · EUR</span>
          <span>
            Netto <strong>{displayMoney(totals.net)}</strong>
          </span>
          <span>
            USt. <strong>{displayMoney(totals.tax)}</strong>
          </span>
          <span>
            Gesamt <strong>{displayMoney(totals.payable)}</strong>
          </span>
        </div>
      )}
      <div className="editor-grid">
        <section className="editor-form">
          <fieldset disabled={!editable || pending}>
            <legend className="sr-only">Rechnungsdaten</legend>
            <div className="panel form-grid">
              <h2 className="full">
                <span className="step">01</span>Empfänger & Details
              </h2>
              <div className="full customer-search">
                <label className="field">
                  Kunden suchen
                  <input
                    value={customerSearch}
                    maxLength={100}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() =>
                    start(async () => {
                      const result = await searchCustomers(customerSearch);
                      if (result.ok) {
                        const selected = customerOptions.find(
                          (c) => c.id === input.customerId,
                        );
                        setCustomerOptions(
                          selected &&
                            !result.value.some((c) => c.id === selected.id)
                            ? [selected, ...result.value]
                            : result.value,
                        );
                      } else setMessage(result.message);
                    })
                  }
                >
                  Suchen
                </Button>
              </div>
              <label className="field full">
                Kunde
                <select
                  id="customerId"
                  value={input.customerId}
                  onChange={(e) => update('customerId', e.target.value)}
                  required
                >
                  <option value="">Kunde auswählen</option>
                  {customerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {(['issueDate', 'dueDate', 'serviceDate'] as const).map(
                (key, i) => (
                  <label className="field" key={key}>
                    {['Rechnungsdatum', 'Fällig am', 'Leistungsdatum'][i]}
                    <input
                      id={key}
                      type="date"
                      value={input[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </label>
                ),
              )}
              <label className="field">
                Kundenreferenz
                <input
                  id="buyerReference"
                  value={input.buyerReference}
                  maxLength={200}
                  onChange={(e) => update('buyerReference', e.target.value)}
                />
              </label>
            </div>
            <div className="panel">
              <h2>
                <span className="step">02</span>Leistungen
              </h2>
              <div id="lines" tabIndex={-1}>
                {input.lines.map((line, i) => (
                  <div className="line-editor" key={`${baseId}-${i}`}>
                    <div className="line-heading">
                      <strong>Position {String(i + 1).padStart(2, '0')}</strong>
                      <Button
                        variant="ghost"
                        aria-label={`Position ${i + 1} entfernen`}
                        disabled={input.lines.length === 1}
                        onClick={() =>
                          update(
                            'lines',
                            input.lines.filter((_, n) => n !== i),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    <label className="field">
                      Beschreibung
                      <input
                        id={`lines.${i}.description`}
                        value={line.description}
                        onChange={(e) =>
                          updateLine(i, 'description', e.target.value)
                        }
                        maxLength={1000}
                      />
                    </label>
                    <div className="line-numbers">
                      <label className="field">
                        Menge
                        <input
                          id={`lines.${i}.quantity`}
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(
                              i,
                              'quantity',
                              e.target.value.replace(',', '.'),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Einheit
                        <select
                          id={`lines.${i}.unit`}
                          value={line.unit}
                          onChange={(e) =>
                            updateLine(i, 'unit', e.target.value)
                          }
                        >
                          <option value="" disabled>
                            Bitte wählen
                          </option>
                          <option value="HUR">Stunde</option>
                          <option value="C62">Stück</option>
                          <option value="DAY">Tag</option>
                        </select>
                      </label>
                      <label className="field">
                        Preis netto
                        <input
                          id={`lines.${i}.unitPrice`}
                          inputMode="decimal"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(
                              i,
                              'unitPrice',
                              e.target.value.replace(',', '.'),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        USt.
                        <select
                          id={`lines.${i}.vatRate`}
                          value={line.vatRate}
                          onChange={(e) =>
                            updateLine(i, 'vatRate', e.target.value)
                          }
                        >
                          <option value="" disabled>
                            Bitte wählen
                          </option>
                          <option value="19">19 %</option>
                          <option value="7">7 %</option>
                        </select>
                      </label>
                    </div>
                    <details>
                      <summary>Nachlass / Zuschlag</summary>
                      <div className="form-grid">
                        <label className="field">
                          Nachlass netto
                          <input
                            inputMode="decimal"
                            id={`lines.${i}.allowance`}
                            value={line.allowance}
                            onChange={(e) =>
                              updateLine(
                                i,
                                'allowance',
                                e.target.value.replace(',', '.'),
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          Zuschlag netto
                          <input
                            inputMode="decimal"
                            id={`lines.${i}.charge`}
                            value={line.charge}
                            onChange={(e) =>
                              updateLine(
                                i,
                                'charge',
                                e.target.value.replace(',', '.'),
                              )
                            }
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                disabled={input.lines.length >= 200}
                onClick={() =>
                  update('lines', [
                    ...input.lines,
                    {
                      description: '',
                      quantity: requireExplicitValues ? '' : '1',
                      unitPrice: requireExplicitValues ? '' : '0',
                      unit: requireExplicitValues ? '' : 'HUR',
                      vatRate: requireExplicitValues ? '' : '19',
                      allowance: '0',
                      charge: '0',
                    },
                  ])
                }
              >
                <Plus size={16} />
                Position hinzufügen
              </Button>
            </div>
            <div className="panel">
              <h2>
                <span className="step">03</span>Hinweise & Zahlung
              </h2>
              <label className="field">
                Hinweis an den Kunden
                <textarea
                  id="notes"
                  value={input.notes}
                  maxLength={2000}
                  onChange={(e) => update('notes', e.target.value)}
                />
              </label>
              <p className="muted">
                Bankdaten werden beim Speichern aus den Unternehmensdaten
                übernommen.
              </p>
            </div>
          </fieldset>
        </section>
        <section className="preview-area" aria-label="Rechnungsvorschau">
          <div className="tabs" role="tablist" aria-label="Ansicht">
            {(['preview', 'validation', 'data'] as const).map((t, i) => (
              <button
                id={`tab-${t}`}
                role="tab"
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                key={t}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const tabs = ['preview', 'validation', 'data'] as const;
                    const next =
                      tabs[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3]!;
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setTab(t)}
              >
                {['Vorschau', 'Prüfung', 'Strukturierte Daten'][i]}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
          >
            {tab === 'preview' && (
              <>
                <div className="paper">
                  <div className="paper-top">
                    <strong>{seller.name}</strong>
                    <span className="draft-stamp">{number ?? 'ENTWURF'}</span>
                  </div>
                  <small>
                    {seller.line1} · {seller.postalCode} {seller.city}
                  </small>
                  <div className="paper-address">
                    <p>
                      <strong>
                        {customerOptions.find((c) => c.id === input.customerId)
                          ?.name ?? 'Rechnungsempfänger'}
                      </strong>
                      <br />
                      {buyer && input.customerId === initial.customerId ? (
                        <>
                          {buyer.line1}
                          <br />
                          {buyer.postalCode} {buyer.city}
                        </>
                      ) : (
                        <span className="muted">
                          Anschrift wird beim Speichern übernommen.
                        </span>
                      )}
                    </p>
                    <dl>
                      <dt>Rechnungsdatum</dt>
                      <dd>{input.issueDate}</dd>
                      <dt>Fällig am</dt>
                      <dd>{input.dueDate}</dd>
                      <dt>Leistungsdatum</dt>
                      <dd>{input.serviceDate}</dd>
                    </dl>
                  </div>
                  <h2>Rechnung</h2>
                  <p className="muted">
                    Vielen Dank für die gute Zusammenarbeit.
                  </p>
                  <table className="paper-lines">
                    <thead>
                      <tr>
                        <th>Leistung</th>
                        <th className="numeric">Menge</th>
                        <th className="numeric">Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {input.lines.map((l, i) => (
                        <tr key={i}>
                          <td>
                            {l.description || 'Ihre Leistung'}
                            <small>
                              {l.vatRate
                                ? `${l.vatRate} % USt.`
                                : 'Umsatzsteuer noch festlegen'}
                            </small>
                          </td>
                          <td className="numeric">{l.quantity}</td>
                          <td className="numeric">
                            {totals ? displayMoney(totals.lines[i]!.net) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totals && (
                    <dl className="totals">
                      <div>
                        <dt>Nettobetrag</dt>
                        <dd>{displayMoney(totals.net)}</dd>
                      </div>
                      {totals.taxes.map((t) => (
                        <div key={t.rate}>
                          <dt>Umsatzsteuer {t.rate} %</dt>
                          <dd>{displayMoney(t.tax)}</dd>
                        </div>
                      ))}
                      <div className="grand-total">
                        <dt>Gesamtbetrag</dt>
                        <dd>{displayMoney(totals.payable)}</dd>
                      </div>
                    </dl>
                  )}
                  <p className="paper-notes">{input.notes}</p>
                  <footer>
                    <strong>{seller.name}</strong>
                    <br />
                    {seller.email}
                    <br />
                    {seller.iban}
                  </footer>
                </div>
                <p className="preview-note">
                  Unverbindliche Vorschau · Die verbindliche Berechnung erfolgt
                  beim Speichern auf dem Server.
                </p>
              </>
            )}
            {tab === 'validation' && (
              <div className="panel validation">
                <CheckCircle2 size={28} />
                <h2>Angaben prüfen</h2>
                <p className="muted">
                  Prüfen Sie den gespeicherten Stand mit dem offiziellen
                  XRechnungsregelwerk. Lokale Eingabeprüfungen unterstützen Sie
                  beim Bearbeiten.
                </p>
                {issues.length ? (
                  <ul>
                    {issues.map((issue, i) => (
                      <li key={i}>
                        <button
                          className="issue"
                          onClick={() => focusField(issue.fieldPath)}
                        >
                          {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="notice">
                    Die lokale Prüfung hat keine Probleme gefunden.
                  </p>
                )}
                <Button
                  disabled={!id || dirty || pending || !editable}
                  onClick={() => {
                    if (id && revision)
                      start(async () => {
                        const r = await requestEinvoice(
                          id,
                          revision,
                          'VALIDATE',
                          crypto.randomUUID(),
                        );
                        setMessage(
                          r.ok ? 'E-Rechnungsprüfung gestartet.' : r.message,
                        );
                        router.refresh();
                      });
                  }}
                >
                  Gespeicherten Entwurf prüfen
                </Button>
                {(!id || dirty) && (
                  <p className="muted">
                    Speichern Sie Ihre Änderungen vor der Serverprüfung.
                  </p>
                )}
              </div>
            )}
            {tab === 'data' && (
              <div className="panel">
                <h2>Entwurfsdaten</h2>
                <p className="muted">
                  Erweiterte Ansicht · kein elektronisches Rechnungsformat.
                </p>
                <details>
                  <summary>Zuordnung zu EN 16931</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Feld</th>
                          <th>Business Term</th>
                        </tr>
                      </thead>
                      <tbody>
                        {businessTerms.map((t) => (
                          <tr key={t.field + t.businessTerm}>
                            <td>{t.field}</td>
                            <td>{t.businessTerm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <pre>
                  {JSON.stringify(
                    { input, calculatedPreview: totals },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function focusField(path: string) {
  const element = document.getElementById(path);
  const details = element?.closest('details');
  if (details) details.open = true;
  element?.focus();
}
