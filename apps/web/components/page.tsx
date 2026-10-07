import Link from 'next/link';
import { ArrowUpRight, FileText } from 'lucide-react';
import { displayMoney } from '@flux/invoice-core';
import type { InvoiceService } from '@flux/application';
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Empty({
  title,
  text,
  href,
  label,
}: {
  title: string;
  text: string;
  href: string;
  label: string;
}) {
  return (
    <div className="empty">
      <FileText size={32} />
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      <Link className="button button-primary" href={href}>
        {label}
        <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
export const labels: Record<string, string> = {
  DRAFT: 'Entwurf',
  VALIDATED: 'Geprüft',
  FINALIZED: 'Finalisiert',
  SENT: 'Gesendet',
  PAID: 'Bezahlt',
  OVERDUE: 'Überfällig',
  CANCELLED: 'Storniert',
  CREDITED: 'Gutgeschrieben',
};
export function InvoiceTable({
  rows,
}: {
  rows: Awaited<ReturnType<InvoiceService['listInvoices']>>;
}) {
  return (
    <div className="table-scroll">
      <table className="invoice-table">
        <thead>
          <tr>
            <th>Rechnung / Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th className="numeric">Betrag</th>
            <th>
              <span className="sr-only">Öffnen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ invoice: i, buyer, ready }) => (
            <tr key={i.id}>
              <td>
                <Link href={`/invoices/${i.id}`}>
                  <strong>
                    {i.number ?? `ENTWURF · ${i.id.slice(0, 8).toUpperCase()}`}
                  </strong>
                  <small>{buyer}</small>
                </Link>
              </td>
              <td>{i.issueDate.split('-').reverse().join('.')}</td>
              <td>
                <span
                  className={`badge ${ready || i.status === 'FINALIZED' ? 'green' : ''}`}
                >
                  {i.finalizationPending
                    ? 'In Verarbeitung'
                    : i.status === 'VALIDATED'
                      ? ready
                        ? 'Bereit'
                        : 'Entwurf'
                      : labels[i.status]}
                </span>
              </td>
              <td className="numeric amount">{displayMoney(i.payable)}</td>
              <td>
                <Link
                  aria-label={`Rechnung für ${buyer} öffnen`}
                  href={`/invoices/${i.id}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  page,
  count,
  base,
  query = {},
}: {
  page: number;
  count: number;
  base: string;
  query?: Record<string, string>;
}) {
  return (
    <nav className="pagination" aria-label="Seitennavigation">
      {page > 1 && (
        <Link
          href={`${base}?${new URLSearchParams({ ...query, page: String(page - 1) })}`}
        >
          ← Zurück
        </Link>
      )}
      <span>Seite {page}</span>
      {count === 50 && (
        <Link
          href={`${base}?${new URLSearchParams({ ...query, page: String(page + 1) })}`}
        >
          Weiter →
        </Link>
      )}
    </nav>
  );
}
export function pageNumber(value: string | string[] | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}
