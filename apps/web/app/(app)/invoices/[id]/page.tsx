import { notFound } from 'next/navigation';
import { AppError } from '@flux/shared';
import { ZodError } from 'zod';
import { InvoiceWorkspace } from '../../../../components/invoice-workspace';
import { IssuedInvoice } from '../../../../components/issued-invoice';
import { authorize, can } from '@flux/auth';
import { InvoiceLifecycle } from '../../../../components/invoice-lifecycle';
import { principal, service, einvoice, db } from '../../../../lib/server';
import { InvoiceEditor } from '../../../../components/invoice-editor';
import { toInput } from '@flux/application';
export default async function Invoice({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await principal();
  const detail = await service.invoice(p, (await params).id).catch((error) => {
    if (
      (error instanceof AppError && error.code === 'NOT_FOUND') ||
      error instanceof ZodError
    )
      notFound();
    throw error;
  });
  const history = await einvoice.history(p, detail.invoice.id);
  const membership = await authorize(db, p, 'read');
  const currentRun = history.runs.find(
    (r) => r.revision === detail.invoice.revision && r.profile === 'XRECHNUNG',
  );
  const currentJob = history.jobs.find(
    (j) => j.revision === detail.invoice.revision,
  );
  const customers = await service.listCustomers(p);
  const seller = detail.parties.find((p) => p.kind === 'SELLER');
  const buyer = detail.parties.find((p) => p.kind === 'BUYER');
  if (!seller || !buyer) throw new Error('Invoice snapshot missing');
  if (!customers.some((c) => c.id === detail.invoice.customerId))
    customers.push(
      (await service.customer(p, detail.invoice.customerId)).customer,
    );
  return (
    <InvoiceWorkspace key={`${detail.invoice.id}-${detail.invoice.revision}`}>
      <InvoiceLifecycle
        id={detail.invoice.id}
        revision={detail.invoice.revision}
        customer={buyer.name}
        payable={detail.invoice.payable}
        status={detail.invoice.status}
        pending={detail.invoice.finalizationPending}
        integrity={history.integrity}
        ready={!!currentRun?.valid}
        canFinalize={can(membership.role, 'invoice:finalize')}
        job={currentJob}
        document={history.documents[0]}
        issues={detail.run?.profile === 'XRECHNUNG' ? detail.issues : []}
      />
      {detail.invoice.status === 'FINALIZED' ? (
        <IssuedInvoice detail={detail} document={history.documents[0]} />
      ) : (
        <InvoiceEditor
          key={`${detail.invoice.id}-${detail.invoice.revision}-${detail.invoice.status}`}
          customers={customers}
          seller={seller}
          buyer={buyer}
          initial={toInput(detail)}
          id={detail.invoice.id}
          revision={detail.invoice.revision}
          status={detail.invoice.status}
          frozen={detail.invoice.finalizationPending}
          number={detail.invoice.number ?? undefined}
        />
      )}
      <section className="panel history">
        <h2>Aktivität & Prüfverlauf</h2>
        <div className="history-grid">
          <div>
            {history.activity.map((e) => (
              <p key={e.id}>
                <time>{e.createdAt.toLocaleString('de-DE')}</time>{' '}
                {(
                  {
                    'invoice.created': 'Entwurf erstellt',
                    'invoice.updated': 'Entwurf gespeichert',
                    'invoice.finalized': 'Rechnung finalisiert',
                    'einvoice.validated': 'E-Rechnung geprüft',
                    'einvoice.failed': 'Verarbeitung benötigt Aufmerksamkeit',
                    'document.downloaded': 'Dokument heruntergeladen',
                    'einvoice.validate.requested': 'Prüfung angefordert',
                    'einvoice.finalize.requested': 'Finalisierung angefordert',
                  } as Record<string, string>
                )[e.eventType] ?? 'Rechnungsereignis'}
              </p>
            ))}
          </div>
          <div>
            {history.runs.map((r) => (
              <details key={r.id}>
                <summary>
                  {r.valid ? 'Bestanden' : 'Nicht bestanden'} ·{' '}
                  {r.purpose === 'ISSUANCE'
                    ? 'Ausstellungsprüfung'
                    : 'Entwurfsprüfung'}{' '}
                  · Stand {r.revision}
                </summary>
                <p>
                  {r.profile} {r.profileVersion} · Regelwerk {r.rulesetVersion}{' '}
                  · Validator {r.validatorVersion ?? '—'}
                </p>
                <code>{r.candidateHash}</code>
              </details>
            ))}
          </div>
        </div>
      </section>
    </InvoiceWorkspace>
  );
}
