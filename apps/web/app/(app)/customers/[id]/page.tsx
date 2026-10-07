import { notFound } from 'next/navigation';
import { AppError } from '@flux/shared';
import { ZodError } from 'zod';
import Link from 'next/link';
import { displayMoney } from '@flux/invoice-core';
import { InvoiceTable } from '../../../../components/page';
import { principal, service } from '../../../../lib/server';
import { BusinessForm } from '../../../../components/forms';
import { Heading } from '../../../../components/page';
export default async function Customer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await principal();
  const { customer, address } = await service
    .customer(p, (await params).id)
    .catch((error) => {
      if (
        (error instanceof AppError && error.code === 'NOT_FOUND') ||
        error instanceof ZodError
      )
        notFound();
      throw error;
    });
  const [invoices, summary] = await Promise.all([
    service.listInvoices(p, 1, '', '', customer.id),
    service.summary(p, customer.id),
  ]);
  return (
    <>
      <Heading
        eyebrow="KUNDEN / PROFIL"
        title={customer.name}
        description="Änderungen gelten für neue und erneut gespeicherte Entwürfe."
      >
        <Link
          className="button button-primary"
          href={`/invoices/new?customer=${customer.id}`}
        >
          Rechnung erstellen
        </Link>
      </Heading>
      <section className="metrics" aria-label="Kundenkennzahlen">
        <article>
          <p>Offen</p>
          <strong>{displayMoney(summary.outstanding)}</strong>
          <small>Ausgestellte Rechnungen</small>
        </article>
        <article>
          <p>Davon überfällig</p>
          <strong>{displayMoney(summary.overdue)}</strong>
          <small>Fälligkeit überschritten</small>
        </article>
        <article>
          <p>Rechnungen</p>
          <strong>{summary.count}</strong>
          <small>Einschließlich Entwürfe</small>
        </article>
        <article>
          <p>Entwürfe</p>
          <strong>{displayMoney(summary.total)}</strong>
          <small>Noch nicht ausgestellt</small>
        </article>
      </section>
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="section-heading">
          <h2>Letzte Rechnungen</h2>
        </div>
        {invoices.length ? (
          <InvoiceTable rows={invoices.slice(0, 10)} />
        ) : (
          <p className="muted">
            Für diesen Kunden gibt es noch keine Rechnungen.
          </p>
        )}
      </section>
      <BusinessForm
        kind="customer"
        id={customer.id}
        initial={{
          name: customer.name,
          email: customer.email,
          vatId: customer.vatId,
          line1: address.line1,
          postalCode: address.postalCode,
          city: address.city,
        }}
      />
    </>
  );
}
