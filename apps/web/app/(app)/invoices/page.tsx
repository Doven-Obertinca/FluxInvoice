import Link from 'next/link';
import { principal, service } from '../../../lib/server';
import {
  Heading,
  InvoiceTable,
  Empty,
  pageNumber,
} from '../../../components/page';
export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const p = await principal();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const q = (params.q ?? '').slice(0, 100);
  const allowed = [
    '',
    'DRAFT',
    'VALIDATED',
    'FINALIZED',
    'SENT',
    'PAID',
    'OVERDUE',
    'CANCELLED',
    'CREDITED',
  ];
  const status = allowed.includes(params.status ?? '')
    ? (params.status ?? '')
    : '';
  const rows = await service.listInvoices(p, page, q, status);
  const pageLink = (page: number) =>
    `/invoices?${new URLSearchParams({ q, status, page: String(page) })}`;
  return (
    <>
      <Heading
        eyebrow="RECHNUNGEN"
        title="Rechnungen"
        description="Vom ersten Entwurf bis zur archivierten XRechnung."
      >
        <Link className="button button-outline" href="/invoices/import">
          Brief / QR-Code lesen
        </Link>
        <Link className="button button-primary" href="/invoices/new">
          Neue Rechnung
        </Link>
      </Heading>
      <section className="panel">
        <form className="filter-bar">
          <label className="field">
            Rechnung oder Kunde suchen
            <input
              name="q"
              placeholder="Nummer oder Firmenname"
              defaultValue={q}
              maxLength={100}
            />
          </label>
          <label className="field">
            Status
            <select name="status" defaultValue={status}>
              <option value="">Alle Status</option>
              <option value="DRAFT">Entwurf</option>
              <option value="VALIDATED">Geprüft</option>
              <option value="FINALIZED">Finalisiert</option>
              <option value="PAID">Bezahlt</option>
            </select>
          </label>
          <button className="button button-outline">Filtern</button>
        </form>
        {rows.length ? (
          <InvoiceTable rows={rows} />
        ) : (
          <Empty
            title={
              q || status
                ? 'Keine passenden Rechnungen'
                : 'Noch keine Rechnungen'
            }
            text={
              q || status
                ? 'Passen Sie den Suchbegriff oder den Statusfilter an.'
                : 'Erfassen Sie Ihre Leistungen. FluxInvoice prüft die E-Rechnungsangaben vor der Finalisierung.'
            }
            href={q || status ? '/invoices' : '/invoices/new'}
            label={q || status ? 'Filter zurücksetzen' : 'Rechnung erstellen'}
          />
        )}
        <nav className="pagination" aria-label="Seitennavigation">
          {page > 1 ? <Link href={pageLink(page - 1)}>Zurück</Link> : <span />}
          <span>
            Seite {page} · {rows.length} Einträge
          </span>
          {rows.length === 50 ? (
            <Link href={pageLink(page + 1)}>Weiter</Link>
          ) : (
            <span />
          )}
        </nav>
      </section>
    </>
  );
}
