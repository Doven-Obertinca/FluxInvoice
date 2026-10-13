import Link from 'next/link';
import { displayMoney } from '@flux/invoice-core';
import { principal, service } from '../../../../lib/server';
import { Heading, Empty, pageNumber } from '../../../../components/page';
const reasons = {
  PROCESSING: [
    'Verarbeitung unterbrochen',
    'Status und Wiederherstellung prüfen',
  ],
  VALIDATION: [
    'E-Rechnungsprüfung fehlgeschlagen',
    'Angaben korrigieren und erneut prüfen',
  ],
  OVERDUE: [
    'Zahlung: überfällig',
    'Zahlungseingang außerhalb von ERechno abgleichen',
  ],
} as const;
export default async function Attention({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const rows = await service.attention(await principal(), page);
  return (
    <>
      <Heading
        eyebrow="AUSGANGSRECHNUNGEN"
        title="Handlungsbedarf"
        description="Fehlgeschlagene Prüfungen, unterbrochene Verarbeitung und überfällige ausgestellte Rechnungen."
      >
        <Link className="button button-outline" href="/invoices">
          Alle Rechnungen
        </Link>
      </Heading>
      <section className="panel">
        <p className="muted">
          Prüfhinweise beziehen sich auf den gespeicherten Stand. Überfällig
          bedeutet nicht ungeprüft. Es werden keine Mahnungen versendet oder
          Zahlungen ausgelöst.
        </p>
        {rows.length ? (
          <div className="table-scroll">
            <table className="invoice-table attention-table">
              <thead>
                <tr>
                  <th>Rechnung / Kunde</th>
                  <th>Handlungsbedarf</th>
                  <th className="numeric">Betrag</th>
                  <th>Nächster Schritt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/invoices/${r.id}`}>
                        <strong>
                          {r.number ??
                            `ENTWURF · ${r.id.slice(0, 8).toUpperCase()}`}
                        </strong>
                        <small>{r.buyer}</small>
                        <span className="attention-mobile">
                          <small>{reasons[r.reason][0]}</small>
                          {r.reason === 'OVERDUE' && (
                            <small>
                              Fällig:{' '}
                              {r.due_date.split('-').reverse().join('.')}
                            </small>
                          )}
                          <small className="text-button">
                            {reasons[r.reason][1]} →
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {reasons[r.reason][0]}
                      {r.reason === 'OVERDUE' && (
                        <small>
                          Fällig: {r.due_date.split('-').reverse().join('.')}
                        </small>
                      )}
                    </td>
                    <td className="numeric amount">
                      {displayMoney(r.payable)}
                    </td>
                    <td>
                      <Link href={`/invoices/${r.id}`}>
                        {reasons[r.reason][1]}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Kein Handlungsbedarf auf dieser Seite"
            text="Hier erscheinen fehlgeschlagene aktuelle Prüfungen, Verarbeitungsfehler und überfällige ausgestellte Rechnungen. Ungeprüfte Entwürfe finden Sie in der Rechnungsliste."
            href="/invoices"
            label="Rechnungen öffnen"
          />
        )}
        <nav className="pagination" aria-label="Seitennavigation">
          {page > 1 ? (
            <Link href={`/invoices/attention?page=${page - 1}`}>Zurück</Link>
          ) : (
            <span />
          )}
          <span>
            Seite {page} · {rows.length} Einträge
          </span>
          {rows.length === 25 ? (
            <Link href={`/invoices/attention?page=${page + 1}`}>Weiter</Link>
          ) : (
            <span />
          )}
        </nav>
      </section>
    </>
  );
}
