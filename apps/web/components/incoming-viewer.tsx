'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { IncomingService } from '../../../packages/application/src/incoming';
import { approveIncoming, checkIncoming } from '../lib/actions';
import {
  incomingStatus,
  validationStatus,
} from '../../../packages/incoming/src/status';
type Detail = Awaited<ReturnType<IncomingService['detail']>>;
const labels = {
  invoice: 'Rechnung',
  data: 'Strukturierte Daten',
  validation: 'Prüfung',
  original: 'Original',
} as const;
const incomingIssue = (field: string) =>
  field === 'buyerReference'
    ? 'Die Kundenreferenz des Empfängers fehlt oder muss geprüft werden.'
    : field.startsWith('seller.')
      ? 'Eine Angabe des Ausstellers fehlt oder muss geprüft werden.'
      : field.startsWith('buyer.')
        ? 'Eine Empfängerangabe fehlt oder muss geprüft werden.'
        : 'Die XML-Prüfung hat eine Unstimmigkeit gemeldet. Prüfen Sie die Angaben mit dem Aussteller.';
const target = (path: string, ruleId: string) =>
  ruleId === 'PEPPOL-EN16931-R020'
    ? 'incoming-supplier-endpoint'
    : ((
        {
          'seller.name': 'incoming-supplier-name',
          'seller.email': 'incoming-supplier-contact-email',
          'seller.contactName': 'incoming-supplier-contact-name',
          'seller.contactPhone': 'incoming-supplier-contact-phone',
          'seller.vatId': 'incoming-supplier-vat',
          'buyer.name': 'incoming-recipient-name',
          'buyer.email': 'incoming-recipient-endpoint',
          'buyer.vatId': 'incoming-recipient-vat',
          buyerReference: 'incoming-reference',
          issueDate: 'incoming-issue-date',
          dueDate: 'incoming-due-date',
        } as Record<string, string>
      )[path] ??
      (path.startsWith('lines')
        ? 'incoming-lines'
        : path.startsWith('totals')
          ? 'incoming-totals'
          : null));
export function IncomingViewer({
  detail: d,
  canImport,
  canApprove,
}: {
  detail: Detail;
  canImport: boolean;
  canApprove: boolean;
}) {
  const router = useRouter(),
    [tab, setTab] = useState<keyof typeof labels>('invoice'),
    [reviewed, setReviewed] = useState(false),
    [message, setMessage] = useState(''),
    [busy, start] = useTransition();
  useEffect(() => {
    if (d.state !== 'RECEIVED') return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [d.state, router]);
  const view = d.parsed;
  const focus = (id: string) => {
    setTab('invoice');
    requestAnimationFrame(() => {
      const field = document.getElementById(id);
      const disclosure = field?.closest('details');
      if (disclosure) disclosure.open = true;
      field?.focus();
    });
  };
  return (
    <>
      <Link className="back-link" href="/incoming">
        ← Eingangsrechnungen
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EINGANGSRECHNUNG</p>
          <h1>{view?.number || 'Original prüfen'}</h1>
          <p>{view?.supplier.name || d.filename}</p>
        </div>
        <span className="badge">{incomingStatus[d.state]}</span>
      </div>
      <section className="panel">
        <strong>{validationStatus[d.validation]}</strong>
        <p className="muted">
          Technische Gültigkeit bestätigt weder Lieferung noch Identität oder
          Bankverbindung. Gleichen Sie Empfänger, Auftrag, Beträge und
          Zahlungsdaten unabhängig ab.
        </p>
        {d.kind === 'pdf' && (
          <p className="notice">
            Die Rechnungsansicht verwendet eingebettete XML-Daten.
            PDF/A-Konformität und Übereinstimmung des sichtbaren PDF mit dem XML
            sind nicht bestätigt.
          </p>
        )}
        {d.validation === 'UNSUPPORTED' && (
          <p className="notice">
            Die Daten sind lesbar; für dieses Profil ist noch keine offizielle
            Prüfung aktiviert. Eine Freigabe ist deshalb hier nicht möglich.
          </p>
        )}
        {d.errorCode && (
          <p className="notice error">
            {d.errorCode === 'SOURCE_UNREADABLE'
              ? 'Die Datei lässt sich nicht eindeutig und sicher als unterstützte E-Rechnung lesen. Das Original bleibt erhalten. Fordern Sie bei Bedarf eine korrigierte XML- oder Hybriddatei an.'
              : 'Die Verarbeitung konnte nicht abgeschlossen werden. Das Original bleibt erhalten; versuchen Sie die Prüfung erneut.'}
          </p>
        )}
      </section>
      <div
        role="tablist"
        aria-label="Ansicht der Eingangsrechnung"
        className="direction-tabs"
      >
        {(Object.keys(labels) as (keyof typeof labels)[]).map((t, i) => (
          <button
            key={t}
            id={`incoming-tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls="incoming-panel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              const keys = Object.keys(labels) as (keyof typeof labels)[];
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = keys[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4]!;
                setTab(next);
                document.getElementById(`incoming-tab-${next}`)?.focus();
              }
            }}
          >
            {labels[t]}
          </button>
        ))}
      </div>
      <section
        className="panel"
        id="incoming-panel"
        role="tabpanel"
        aria-labelledby={`incoming-tab-${tab}`}
      >
        {tab === 'invoice' &&
          (view ? (
            <>
              <div className="incoming-parties">
                {(
                  [
                    ['supplier', 'Lieferant'],
                    ['recipient', 'Empfänger'],
                  ] as const
                ).map(([kind, label]) => (
                  <section key={kind} id={`incoming-${kind}`} tabIndex={-1}>
                    <h2>{label}</h2>
                    <p id={`incoming-${kind}-name`} tabIndex={-1}>
                      {view[kind].name || 'Nicht angegeben'}
                    </p>
                    <p>{view[kind].address || 'Adresse nicht angegeben'}</p>
                    <p id={`incoming-${kind}-vat`} tabIndex={-1}>
                      USt-ID: {view[kind].vatId || 'Nicht angegeben'}
                    </p>
                    <p id={`incoming-${kind}-endpoint`} tabIndex={-1}>
                      Elektronische Adresse:{' '}
                      {view[kind].endpoint || 'Nicht angegeben'}
                    </p>
                    <details>
                      <summary>Kontaktangaben</summary>
                      <p id={`incoming-${kind}-contact-name`} tabIndex={-1}>
                        Kontakt: {view[kind].contactName || 'Nicht angegeben'}
                      </p>
                      <p id={`incoming-${kind}-contact-phone`} tabIndex={-1}>
                        Telefon: {view[kind].contactPhone || 'Nicht angegeben'}
                      </p>
                      <p id={`incoming-${kind}-contact-email`} tabIndex={-1}>
                        E-Mail: {view[kind].contactEmail || 'Nicht angegeben'}
                      </p>
                    </details>
                  </section>
                ))}
              </div>
              <dl className="confirmation-facts">
                <div id="incoming-issue-date" tabIndex={-1}>
                  <dt>Rechnungsdatum</dt>
                  <dd>{view.issueDate || 'Nicht angegeben'}</dd>
                </div>
                <div id="incoming-due-date" tabIndex={-1}>
                  <dt>Fällig</dt>
                  <dd>{view.dueDate || 'Nicht angegeben'}</dd>
                </div>
                <div>
                  <dt>Dokumenttyp</dt>
                  <dd>
                    {view.type || 'Nicht angegeben'}
                    {view.type === '381' ? ' · Gutschrift' : ''}
                  </dd>
                </div>
                <div id="incoming-reference" tabIndex={-1}>
                  <dt>Kundenreferenz / Leitweg-ID</dt>
                  <dd>{view.buyerReference || 'Nicht angegeben'}</dd>
                </div>
                <div>
                  <dt>Bestellreferenz</dt>
                  <dd>{view.orderReference || 'Nicht angegeben'}</dd>
                </div>
              </dl>
              <section id="incoming-lines" tabIndex={-1}>
                <h2>Positionen</h2>
                <p className="muted">
                  Werte des Ausstellers ·{' '}
                  {view.currency || 'Währung nicht angegeben'}. Einzelpreise
                  können sich auf eine im Original angegebene Basismenge
                  beziehen; maßgeblich ist das Original.
                </p>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Rechnungspositionen"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Leistung</th>
                        <th>Menge</th>
                        <th>Einheit</th>
                        <th>Preis</th>
                        <th>Netto</th>
                        <th>USt. % / Kategorie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{l.id || '—'}</td>
                          <td>{l.description || 'Nicht angegeben'}</td>
                          <td>{l.quantity || '—'}</td>
                          <td>{l.unit || '—'}</td>
                          <td>{l.price || '—'}</td>
                          <td>{l.net || '—'}</td>
                          <td>
                            {l.vat || '—'} / {l.category || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section id="incoming-totals" tabIndex={-1}>
                <h2>Rechnungsbeträge</h2>
                <dl className="confirmation-facts">
                  {(
                    [
                      ['net', 'Netto'],
                      ['tax', 'Umsatzsteuer'],
                      ['gross', 'Brutto'],
                      ['payable', 'Zahlbetrag'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {view.totals[key] || 'Nicht angegeben'} {view.currency}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <h2>Zahlungsangaben</h2>
              {!view.payments.length && <p>Nicht angegeben.</p>}
              {view.payments.map((p, i) => (
                <dl className="confirmation-facts" key={i}>
                  <div>
                    <dt>Zahlungsart (Code)</dt>
                    <dd>{p.means || '—'}</dd>
                  </div>
                  <div>
                    <dt>IBAN / Konto</dt>
                    <dd>{p.iban || 'Nicht angegeben'}</dd>
                  </div>
                  <div>
                    <dt>BIC</dt>
                    <dd>{p.bic || 'Nicht angegeben'}</dd>
                  </div>
                  <div>
                    <dt>Verwendungszweck</dt>
                    <dd>{p.reference || 'Nicht angegeben'}</dd>
                  </div>
                </dl>
              ))}
              {view.notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </>
          ) : (
            <p>
              Eine sichere Rechnungsansicht ist noch nicht verfügbar. Öffnen Sie
              die Prüfung oder laden Sie das Original herunter.
            </p>
          ))}
        {tab === 'data' && (
          <>
            <h2>Strukturierte Daten</h2>
            <p>
              Format: {view?.syntax || 'Noch nicht erkannt'} · Profil:{' '}
              {view?.profile || 'Nicht angegeben'}
            </p>
            <p>
              Leser: {d.parserVersion || 'Ausstehend'}. Diese Ansicht ist eine
              Darstellung des Originals, kein bearbeitbarer Rechnungsentwurf.
            </p>
            <details>
              <summary>Erweiterte Datenansicht</summary>
              <pre>{JSON.stringify(view, null, 2)}</pre>
            </details>
          </>
        )}
        {tab === 'validation' && (
          <>
            <h2>{validationStatus[d.validation]}</h2>
            <p>
              Eine fremde Rechnung korrigiert der Aussteller. Prüfen Sie die
              betroffene Angabe, fordern Sie ein korrigiertes Original an und
              importieren Sie es separat. Eine erneute Prüfung ändert keine
              Rechnungswerte.
            </p>
            {d.issues.map((i, n) => (
              <article className="validation-issue" key={n}>
                <strong>{incomingIssue(i.fieldPath)}</strong>
                <p>
                  {i.fieldPath === 'buyerReference'
                    ? 'Die Referenz ordnet die Rechnung dem Empfänger zu und ist für dieses XRechnungsprofil erforderlich. Teilen Sie dem Aussteller die vereinbarte Referenz mit und fordern Sie eine korrigierte Rechnung an.'
                    : i.fieldPath.startsWith('seller.')
                      ? 'Die Ausstellerangaben dienen der Identifikation und Erreichbarkeit des Lieferanten. Lassen Sie die gemeldete Angabe vom Aussteller bestätigen und im Original korrigieren.'
                      : i.fieldPath.startsWith('buyer.')
                        ? 'Empfängerangaben müssen zur vorgesehenen Rechnungsempfangsstelle passen. Stimmen Sie die korrekten Angaben mit dem Aussteller ab und fordern Sie ein korrigiertes Original an.'
                        : 'Die gemeldete Prüfregel ist für dieses Rechnungsprofil relevant. Gleichen Sie die betroffene Angabe mit Ihren Unterlagen ab und bitten Sie den Aussteller um Klärung oder eine korrigierte Rechnung.'}
                </p>
                {target(i.fieldPath, i.ruleId) && (
                  <button
                    className="text-button"
                    onClick={() => focus(target(i.fieldPath, i.ruleId)!)}
                  >
                    Betroffene Angabe anzeigen
                  </button>
                )}
                <details>
                  <summary>Prüfdetails</summary>
                  <p>
                    {i.businessTerm} · {i.ruleId}
                  </p>
                  <code>{i.technicalLocation}</code>
                </details>
              </article>
            ))}
            {!d.issues.length && (
              <p>
                Keine einzelnen Regelhinweise verfügbar. Maßgeblich ist der oben
                angezeigte Prüfstatus.
              </p>
            )}
            <details>
              <summary>Prüfverlauf und Regelwerk</summary>
              {d.checks.map((c) => (
                <p key={c.id}>
                  {c.createdAt.toLocaleString('de-DE')} ·{' '}
                  {validationStatus[c.validation]} · {c.profileId}
                  <br />
                  Bericht: {c.reportHash || 'Nicht erstellt'}
                </p>
              ))}
            </details>
          </>
        )}
        {tab === 'original' && (
          <>
            <h2>Unverändertes Original</h2>
            <p>
              {d.filename} · {d.size} Bytes · Eingang{' '}
              {d.receivedAt.toLocaleString('de-DE')} · Quelle: Upload
            </p>
            <p>
              Aufbewahrung mindestens bis{' '}
              {d.retainUntil.toLocaleDateString('de-DE')} ·{' '}
              {d.archiveMode === 'S3_OBJECT_LOCK'
                ? 'Object-Lock-Archiv'
                : d.archiveMode === 'LOCAL'
                  ? 'Lokales Entwicklungsarchiv; kein WORM'
                  : 'Archivierung ausstehend'}
            </p>
            <p className="muted">SHA-256</p>
            <code>{d.sha256}</code>
            <p>
              <a
                className="button button-outline"
                href={`/api/v1/incoming/${d.id}/original`}
              >
                Original herunterladen
              </a>
            </p>
            {d.rawXml && (
              <details>
                <summary>XML für Fortgeschrittene</summary>
                <pre>{d.rawXml}</pre>
              </details>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Geschäftliche Prüfung</h2>
        {d.state === 'APPROVED' ? (
          <p>
            Freigegeben am {d.approvedAt?.toLocaleString('de-DE')}. Dies ist
            keine Zahlung, Buchung oder Übergabe an DATEV.
          </p>
        ) : (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              Ich habe Empfänger, Leistung, Beträge und Zahlungsangaben anhand
              meiner Unterlagen geprüft.
            </label>
            <div className="actions">
              {canApprove ? (
                <button
                  className="button button-primary"
                  disabled={
                    busy ||
                    !reviewed ||
                    d.state !== 'REVIEW' ||
                    d.validation !== 'VALID'
                  }
                  onClick={() =>
                    start(async () => {
                      const c = d.checks[0];
                      if (!c) return;
                      const r = await approveIncoming(d.id, c.id, reviewed);
                      setMessage(
                        r.ok ? 'Geschäftlich freigegeben.' : r.message,
                      );
                      router.refresh();
                    })
                  }
                >
                  Geschäftlich freigeben
                </button>
              ) : (
                <p>
                  Die Freigabe erfordert Inhaber-, Administrator- oder
                  Buchhaltungsrechte.
                </p>
              )}
              {canImport && (
                <button
                  className="button button-outline"
                  disabled={busy || d.state === 'RECEIVED'}
                  onClick={() =>
                    start(async () => {
                      const r = await checkIncoming(d.id);
                      setReviewed(false);
                      setMessage(
                        r.ok ? 'Erneute Prüfung angefordert.' : r.message,
                      );
                      router.refresh();
                    })
                  }
                >
                  Original erneut prüfen
                </button>
              )}
            </div>
            {d.validation !== 'VALID' && (
              <p className="muted">
                Vor der Freigabe ist eine bestandene unterstützte XML-Prüfung
                erforderlich.
              </p>
            )}
          </>
        )}
        <p role="status">{message}</p>
      </section>
    </>
  );
}
