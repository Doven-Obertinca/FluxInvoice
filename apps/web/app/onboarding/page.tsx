import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { members } from '@flux/db';
import { db, requireUser } from '../../lib/server';
import { BusinessForm } from '../../components/forms';
export const dynamic = 'force-dynamic';
export default async function Onboarding() {
  const user = await requireUser();
  const [membership] = await db
    .select()
    .from(members)
    .where(eq(members.userId, user.id))
    .limit(1);
  if (membership) redirect('/dashboard');
  return (
    <main className="onboarding">
      <p className="brand">▧ FluxInvoice</p>
      <p className="eyebrow">01 / IHR ARBEITSBEREICH</p>
      <h1>Bereit für einen klaren Start.</h1>
      <p className="muted">
        Hinterlegen Sie Ihre Unternehmensdaten. Sie bilden die Grundlage Ihrer
        Rechnungsentwürfe.
      </p>
      <BusinessForm kind="onboarding" />
    </main>
  );
}
