import Link from 'next/link';
import { principal, service } from '../../../../lib/server';
import { InvoiceEditor } from '../../../../components/invoice-editor';
export default async function NewInvoice({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const p = await principal();
  const [customers, seller] = await Promise.all([
    service.listCustomers(p),
    service.company(p),
  ]);
  const selected = (await searchParams).customer;
  if (selected && !customers.some((c) => c.id === selected)) {
    const row = await service.customer(p, selected);
    customers.push(row.customer);
  }
  if (!customers.length)
    return (
      <div className="empty">
        <h1>Zuerst einen Kunden anlegen.</h1>
        <Link className="button button-primary" href="/customers">
          Kunden anlegen
        </Link>
      </div>
    );
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
  }).format(new Date());
  return (
    <InvoiceEditor
      customers={customers}
      seller={seller}
      initial={{
        customerId: selected ?? '',
        issueDate: today,
        dueDate: today,
        serviceDate: today,
        currency: 'EUR',
        buyerReference: '',
        notes: '',
        adjustments: [],
        lines: [
          {
            description: '',
            quantity: '1',
            unitPrice: '0',
            unit: 'HUR',
            vatRate: '19',
            allowance: '0',
            charge: '0',
          },
        ],
      }}
    />
  );
}
