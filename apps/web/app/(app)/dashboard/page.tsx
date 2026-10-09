import Link from 'next/link';
import { principal, service } from '../../../lib/server';
import { Heading, Empty, InvoiceTable } from '../../../components/page';
import { displayMoney } from '@flux/invoice-core';
export default async function Dashboard() {
  const p = await principal();
  const [summary, invoices] = await Promise.all([
    service.summary(p),
    service.listInvoices(p),
  ]);
  return (
    <>
      <Heading
        eyebrow="ARBEITSPLATZ"
        title="Übersicht"
        description="Ihre Rechnungen, offenen Beträge und nächsten Schritte."
      >
        <Link className="button button-primary" href="/invoices/new">
          Neue Rechnung
        </Link>
      </Heading>
      <section className="metrics" aria-label="Rechnungskennzahlen">
        <article>
          <p>Offene Rechnungen</p>
          <strong>{displayMoney(summary.outstanding)}</strong>
          <small>Ausgestellt · noch nicht bezahlt</small>
        </article>
        <article>
          <p>Davon überfällig</p>
          <strong>{displayMoney(summary.overdue)}</strong>
          <small>Fällig vor dem heutigen Tag</small>
        </article>
        <article>
          <p>Bezahlt</p>
          <strong>{displayMoney(summary.paid)}</strong>
          <small>Als bezahlt erfasste Rechnungen</small>
        </article>
        <article>
          <p>Entwurfsvolumen</p>
          <strong>{displayMoney(summary.total)}</strong>
          <small>Noch nicht ausgestellte Rechnungen</small>
        </article>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Letzte Rechnungen <span className="count">{summary.count}</span>
          </h2>
          <Link href="/invoices">Alle Rechnungen</Link>
        </div>
        {invoices.length ? (
          <InvoiceTable rows={invoices.slice(0, 6)} />
        ) : (
          <Empty
            title="Noch keine Rechnungen"
            text="Legen Sie einen Kunden an. FluxInvoice prüft Ihre erste E-Rechnung, bevor Sie sie finalisieren."
            href="/customers"
            label="Kunden anlegen"
          />
        )}
      </section>
      <div className="bottom-grid">
        <section className="panel">
          <h2>Nächste Schritte</h2>
          <Link className="queue-row" href="/invoices/attention">
            <span>Handlungsbedarf</span>
            <strong>Prüfen →</strong>
          </Link>
          <Link className="queue-row" href="/invoices?status=DRAFT">
            <span>Entwürfe vervollständigen</span>
            <strong>{summary.drafts}</strong>
          </Link>
          <Link className="queue-row" href="/invoices?status=VALIDATED">
            <span>Geprüfte E-Rechnungen finalisieren</span>
            <strong>{summary.ready}</strong>
          </Link>
          <Link className="queue-row" href="/invoices">
            <span>Laufende Finalisierungen prüfen</span>
            <strong>{summary.pending}</strong>
          </Link>
        </section>
        <section className="panel">
          <h2>Vom Entwurf zur E-Rechnung</h2>
          <p className="muted">
            Speichern Sie die Rechnungsdaten und starten Sie die Prüfung. Eine
            bestandene Prüfung bereitet die Rechnung zur Finalisierung vor.
          </p>
          <p className="muted" style={{ marginTop: 12 }}>
            Bei der Finalisierung erhält sie ihre feste Nummer. Anschließend
            steht die archivierte XRechnung zum Download bereit.
          </p>
          <Link className="text-button" href="/settings/company">
            Kontakt- und Bankdaten prüfen
          </Link>
        </section>
      </div>
    </>
  );
}
