import { authorize } from '@flux/auth';
import { principal, db, service } from '../../../../lib/server';
import { InvoiceImport } from '../../../../components/invoice-import';
export default async function ImportInvoice() {
  const p = await principal();
  await authorize(db, p, 'invoice:write');
  const [customers, seller] = await Promise.all([
    service.listCustomers(p),
    service.company(p),
  ]);
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
  }).format(new Date());
  return (
    <InvoiceImport
      customers={customers.map(({ id, name }) => ({ id, name }))}
      seller={seller}
      today={today}
    />
  );
}
