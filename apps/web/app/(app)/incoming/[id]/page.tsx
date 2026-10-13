import { saveFinancialTerms } from '../../../../lib/autopilot-actions';
import { incomingFinancialTerms } from '@flux/db';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { AppError } from '@flux/shared';
import { authorize, can } from '@flux/auth';
import { principal, incoming, db } from '../../../../lib/server';
import { IncomingViewer } from '../../../../components/incoming-viewer';
export default async function IncomingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await principal(),
    role = await authorize(db, p, 'incoming:read');
  const detail = await incoming.detail(p, (await params).id).catch((e) => {
    if (
      e instanceof ZodError ||
      (e instanceof AppError && e.code === 'NOT_FOUND')
    )
      notFound();
    throw e;
  });
  const [terms] = await db
    .select()
    .from(incomingFinancialTerms)
    .where(
      and(
        eq(incomingFinancialTerms.organizationId, p.organizationId),
        eq(incomingFinancialTerms.incomingId, detail.id),
      ),
    );
  return (
    <>
      <IncomingViewer
        key={`${detail.id}-${detail.checks[0]?.id ?? ''}`}
        detail={detail}
        canImport={can(role.role, 'incoming:import')}
        canApprove={can(role.role, 'incoming:approve')}
      />
      {can(role.role, 'incoming:approve') && (
        <section className="panel">
          <h2>Bestätigte Zahlungsbedingungen</h2>
          <p>
            Nur Bedingungen aus dem Original eintragen. Diese Angaben ergänzen
            Ihre Übersicht und verändern das archivierte Dokument nicht.
          </p>
          <form action={saveFinancialTerms}>
            <input type="hidden" name="id" value={detail.id} />
            <label>
              Zahlungsfrist
              <input
                type="date"
                name="dueDay"
                defaultValue={terms?.dueDay ?? ''}
              />
            </label>
            <label>
              Skontofrist
              <input
                type="date"
                name="discountDay"
                defaultValue={terms?.discountDay ?? ''}
              />
            </label>
            <label>
              Skonto in Prozent
              <input
                name="discountRate"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue={terms?.discountRate ?? ''}
              />
            </label>
            <label>
              Skontobasis in EUR
              <input
                name="discountBase"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={terms?.discountBase ?? ''}
              />
            </label>
            <button className="button">Bedingungen bestätigen</button>
          </form>
        </section>
      )}
    </>
  );
}
