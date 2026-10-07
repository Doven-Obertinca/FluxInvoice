import Link from 'next/link';
import { principal, service } from '../../../lib/server';
import { Heading, Pagination, pageNumber } from '../../../components/page';
import { BusinessForm } from '../../../components/forms';
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const p = await principal();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const q = (params.q ?? '').slice(0, 100);
  const customers = await service.listCustomers(p, page, q);
  return (
    <>
      <Heading
        eyebrow="KUNDEN"
        title="Kunden"
        description="Ihre Rechnungsempfänger an einem Ort."
      />
      <section className="panel">
        <form className="filter-bar">
          <label className="field">
            Kunden suchen
            <input
              name="q"
              defaultValue={q}
              placeholder="Firmenname"
              maxLength={100}
            />
          </label>
          <button className="button button-outline">Suchen</button>
        </form>
        <div className="section-heading">
          <h2>Kundenverzeichnis</h2>
        </div>
        {customers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Unternehmen</th>
                  <th>E-Mail</th>
                  <th>Umsatzsteuer-ID</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/customers/${c.id}`}>
                        <strong>{c.name}</strong>
                      </Link>
                    </td>
                    <td>{c.email}</td>
                    <td>{c.vatId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty muted">
            Noch keine Kunden. Legen Sie unten Ihren ersten Kunden an.
          </p>
        )}
        <Pagination
          page={page}
          count={customers.length}
          base="/customers"
          query={{ q }}
        />
      </section>
      <div className="section-heading">
        <h2>Neuer Kunde</h2>
      </div>
      <BusinessForm kind="customer" />
    </>
  );
}
