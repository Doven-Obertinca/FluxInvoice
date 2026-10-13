import { runtimeCapabilities } from '@flux/shared';
import Link from 'next/link';
import { authorize, can } from '@flux/auth';
import { principal, incoming, db } from '../../../lib/server';
import { Heading, pageNumber } from '../../../components/page';
import { InvoiceDirections } from '../../../components/invoice-directions';
import { IncomingUpload } from '../../../components/incoming-upload';
import {
  incomingStatus,
  validationStatus,
} from '../../../../../packages/incoming/src/status';
export default async function Incoming({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; problems?: string }>;
}) {
  const p = await principal(),
    params = await searchParams,
    page = pageNumber(params.page),
    problems = params.problems === '1';
  const role = await authorize(db, p, 'incoming:read'),
    rows = await incoming.list(p, page, problems);
  return (
    <>
      <Heading
        eyebrow="E-RECHNUNGEN"
        title="Eingangsrechnungen"
        description="Originale erhalten, Angaben verstehen und bewusst freigeben."
      />
      <InvoiceDirections current={problems ? 'problems' : 'incoming'} />
      {runtimeCapabilities().compliantArchive &&
        can(role.role, 'incoming:import') && <IncomingUpload />}
      {!runtimeCapabilities().compliantArchive && (
        <p className="notice">
          Die Archivierung und Freigabe eingehender Rechnungen ist noch nicht
          aktiviert. Dokumente können Sie im kostenlosen Viewer ansehen.
        </p>
      )}
      <section className="panel">
        <h2>{problems ? 'Prüfbedarf im Eingang' : 'Posteingang'}</h2>
        {!rows.length ? (
          <p className="muted">Keine Eingangsrechnungen auf dieser Seite.</p>
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Eingangsrechnungen"
          >
            <table className="incoming-table">
              <thead>
                <tr>
                  <th>Lieferant / Rechnung</th>
                  <th>Eingang</th>
                  <th>Fällig</th>
                  <th>Betrag</th>
                  <th>XML-Prüfung</th>
                  <th>Vertrauen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/incoming/${r.id}`}>
                        <strong>
                          {r.supplier || 'Lieferant noch nicht lesbar'}
                        </strong>
                        <small>{r.number || r.filename}</small>
                      </Link>
                    </td>
                    <td>
                      {r.receivedAt.toLocaleDateString('de-DE', {
                        timeZone: 'Europe/Berlin',
                      })}
                    </td>
                    <td>{r.dueDate || 'Nicht angegeben'}</td>
                    <td className="amount">
                      {r.payable || '—'} {r.currency}
                    </td>
                    <td>{validationStatus[r.validation]}</td>
                    <td>Identität nicht bestätigt</td>
                    <td>{incomingStatus[r.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="pagination" aria-label="Seitennavigation">
          {page > 1 ? (
            <Link
              href={`/incoming?page=${page - 1}&problems=${problems ? '1' : '0'}`}
            >
              Zurück
            </Link>
          ) : (
            <span />
          )}
          <span>Seite {page}</span>
          {rows.length === 25 ? (
            <Link
              href={`/incoming?page=${page + 1}&problems=${problems ? '1' : '0'}`}
            >
              Weiter
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </section>
    </>
  );
}
