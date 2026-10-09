'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { displayMoney } from '@flux/invoice-core';
import { requestEinvoice } from '../lib/actions';
import { Button } from './ui/button';
import { correctionGuidance, finalizationBlocker } from '@flux/einvoice';
import { useInvoiceDirty } from './invoice-workspace';
export interface LifecycleProps {
  id: string;
  revision: number;
  customer: string;
  customerId: string;
  payable: string;
  status: string;
  pending: boolean;
  integrity?: boolean | undefined;
  ready: boolean;
  canFinalize: boolean;
  job?: { state: string; lastErrorCode: string | null } | undefined;
  document?: { id: string; sha256: string; archiveMode: string } | undefined;
  issues: {
    ruleId: string;
    message: string;
    fieldPath: string;
    businessTerm: string;
    technicalLocation: string;
    severity: string;
  }[];
}
export function InvoiceLifecycle(p: LifecycleProps) {
  const { dirty } = useInvoiceDirty();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [requestError, setRequestError] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const active =
    p.job && ['QUEUED', 'VALIDATING', 'ARCHIVING'].includes(p.job.state);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(interval);
  }, [active, router]);
  const request = (kind: 'VALIDATE' | 'FINALIZE') =>
    start(async () => {
      const result = await requestEinvoice(
        p.id,
        p.revision,
        kind,
        crypto.randomUUID(),
      );
      setRequestError(!result.ok);
      setMessage(
        result.ok
          ? 'Der Auftrag wurde gestartet. Sie können diese Seite geöffnet lassen.'
          : result.message,
      );
      if (result.ok) setOpen(false);
      router.refresh();
    });
  const blocker = finalizationBlocker({
    finalized: !!p.document,
    dirty,
    active: !!active,
    canFinalize: p.canFinalize,
    pending: p.pending,
    ready: p.ready,
    failed: p.issues.some((i) => i.severity === 'ERROR'),
  });
  return (
    <section className="lifecycle" aria-label="E-Rechnungsstatus">
      <div className="lifecycle-status">
        <span
          className={`status-dot ${p.status === 'FINALIZED' || p.ready ? 'success' : ''}`}
        />
        <div>
          <strong>
            {p.status === 'FINALIZED'
              ? p.integrity === false
                ? 'Archivprüfung fehlgeschlagen'
                : 'Finalisiert · archiviert'
              : active
                ? p.job?.state === 'ARCHIVING'
                  ? 'Archiv wird geprüft …'
                  : 'E-Rechnung wird geprüft …'
                : p.job?.state === 'FAILED'
                  ? 'Aktion erforderlich'
                  : p.ready
                    ? 'E-Rechnung bereit'
                    : 'E-Rechnung noch nicht geprüft'}
          </strong>
          <p>
            {p.status === 'FINALIZED'
              ? p.integrity === false
                ? 'Die Datei konnte zuletzt nicht sicher gelesen werden. Bitte wenden Sie sich an den Support.'
                : 'Die ausgestellte Rechnung ist unveränderbar.'
              : p.pending
                ? 'Die Rechnungsdaten sind für die Finalisierung gesperrt.'
                : p.ready
                  ? 'Der gespeicherte Stand hat die offizielle Prüfung bestanden.'
                  : 'Prüfen Sie den gespeicherten Stand vor der Finalisierung.'}
          </p>
        </div>
      </div>
      <div className="actions">
        {p.document ? (
          <a
            className="button button-default"
            href={`/api/v1/documents/${p.document.id}/download`}
          >
            XRechnung herunterladen
          </a>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={dirty || busy || !!active || p.pending}
              onClick={() => request('VALIDATE')}
            >
              E-Rechnung prüfen
            </Button>
            {p.canFinalize && (
              <Button
                disabled={dirty || busy || !!active || (!p.ready && !p.pending)}
                onClick={() => setOpen(true)}
              >
                {p.pending ? 'Finalisierung erneut versuchen' : 'Finalisieren'}
              </Button>
            )}
          </>
        )}
      </div>
      {blocker && (
        <div className="full notice">
          <strong>Vor der Finalisierung</strong>
          <p>{blocker}</p>
        </div>
      )}
      {dirty && (
        <p className="full notice">
          Speichern Sie Ihre Änderungen, bevor Sie die E-Rechnung prüfen oder
          finalisieren.
        </p>
      )}
      <div className="full" role="status">
        {requestError || active ? message : ''}
      </div>
      {p.job?.state === 'FAILED' && (
        <p className="notice error full">
          {p.job.lastErrorCode === 'VALIDATION_FAILED'
            ? 'Bitte korrigieren und speichern Sie die unten genannten Angaben.'
            : 'Die Verarbeitung wurde nicht abgeschlossen. Es wurde keine erfolgreiche Finalisierung gemeldet. Sie können den Vorgang erneut versuchen.'}
        </p>
      )}
      {!!p.issues.length && (
        <div className="full validation-issues">
          {p.issues.map((i, n) => (
            <div key={n} className="validation-issue">
              <strong>
                {i.severity === 'WARNING' ? 'Hinweis' : 'Bitte korrigieren'}:{' '}
                {i.message}
              </strong>
              <p>{correctionGuidance(i.fieldPath).why}</p>
              <p className="muted">{correctionGuidance(i.fieldPath).action}</p>
              {i.fieldPath.startsWith('seller.') ? (
                <Link href="/settings/company">Unternehmensdaten öffnen</Link>
              ) : i.fieldPath.startsWith('buyer.') ? (
                <Link href={`/customers/${p.customerId}`}>
                  Kundendaten öffnen
                </Link>
              ) : /^(buyerReference|issueDate|dueDate|serviceDate|notes|lines\.\d+\.(description|quantity|unit|unitPrice|vatRate|allowance|charge))$/.test(
                  i.fieldPath,
                ) ? (
                <button
                  className="text-button"
                  onClick={() => {
                    const el = document.getElementById(i.fieldPath);
                    el?.closest('details')?.setAttribute('open', '');
                    el?.focus();
                  }}
                >
                  Zum Feld
                </button>
              ) : (
                <span className="muted">
                  Prüfen Sie die Rechnungsangaben; bei Bedarf die Prüfdetails
                  öffnen.
                </span>
              )}
              <details>
                <summary>Prüfdetails</summary>
                <small>
                  {i.ruleId} · {i.businessTerm} · XRechnung 3.0.2
                </small>
                <code>{i.technicalLocation}</code>
              </details>
            </div>
          ))}
        </div>
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Rechnung finalisieren</Dialog.Title>
            <Dialog.Description>
              Die Rechnung erhält ihre endgültige Nummer. Danach können die
              Rechnungsdaten nicht mehr bearbeitet werden.
            </Dialog.Description>
            <dl className="confirmation-facts">
              <div>
                <dt>Empfänger</dt>
                <dd>{p.customer}</dd>
              </div>
              <div>
                <dt>Gesamtbetrag</dt>
                <dd>{displayMoney(p.payable)}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>XRechnung 3.0.2 · UBL</dd>
              </div>
              <div>
                <dt>Prüfung</dt>
                <dd>{p.ready ? 'Bestanden' : 'Wird erneut durchgeführt'}</dd>
              </div>
              <div>
                <dt>Rechnungsnummer</dt>
                <dd>
                  {p.pending
                    ? 'Reservierte Nummer wird beibehalten'
                    : 'Wird einmalig vergeben'}
                </dd>
              </div>
            </dl>
            <div className="actions">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={busy}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button disabled={busy} onClick={() => request('FINALIZE')}>
                {busy ? 'Wird gestartet …' : 'Rechnung finalisieren'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
