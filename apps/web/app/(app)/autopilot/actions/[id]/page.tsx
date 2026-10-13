import {
  severityLabels,
  statusLabels,
} from '../../../../../lib/autopilot-labels';
import Link from 'next/link';
import { autopilot, principal, db } from '../../../../../lib/server';
import {
  respondToAction,
  preparePayment,
  confirmPayment,
  prepareDuplicate,
  confirmDuplicate,
} from '../../../../../lib/autopilot-actions';
import { incomingDocuments, financialConfirmations } from '@flux/db';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
export default async function Action({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const { id } = await params;
  const p = await principal();
  const a = await autopilot.detail(p, id);
  const { confirmation } = await searchParams;
  const ticket =
    confirmation && z.uuid().safeParse(confirmation).success
      ? (
          await db
            .select()
            .from(financialConfirmations)
            .where(
              and(
                eq(financialConfirmations.organizationId, p.organizationId),
                eq(financialConfirmations.actorId, p.userId),
                eq(financialConfirmations.actionId, id),
                eq(financialConfirmations.id, confirmation),
              ),
            )
        )[0]
      : null;
  const comparisons = a.relatedId
    ? await db
        .select({
          id: incomingDocuments.id,
          filename: incomingDocuments.filename,
          hash: incomingDocuments.sha256,
          parsed: incomingDocuments.parsed,
        })
        .from(incomingDocuments)
        .where(
          and(
            eq(incomingDocuments.organizationId, p.organizationId),
            sql`${incomingDocuments.id} IN (${a.entityId},${a.relatedId})`,
          ),
        )
    : [];
  comparisons.sort((left, right) =>
    left.id === a.entityId ? -1 : right.id === a.entityId ? 1 : 0,
  );
  const source =
    a.entityType === 'organization'
      ? '/autopilot'
      : a.entityType === 'incoming'
        ? `/incoming/${a.entityId}`
        : `/invoices/${a.entityId}`;
  const open = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(a.status);
  return (
    <section className="panel">
      <Link href="/autopilot">← Alle Hinweise</Link>
      <p className="eyebrow">
        {severityLabels[a.severity]} · {statusLabels[a.status]}
      </p>
      <h1>{a.title}</h1>
      <p>{a.reason}</p>
      <p>{a.recommendation}</p>
      <Link className="button button-primary" href={source}>
        Quelle prüfen
      </Link>
      {a.relatedId && (
        <Link className="button" href={`/incoming/${a.relatedId}`}>
          Vergleichsdokument öffnen
        </Link>
      )}
      {comparisons.length === 2 && (
        <div className="autopilot-actions">
          {comparisons.map((d) => (
            <article className="autopilot-card" key={d.id}>
              <p>
                {d.id === a.entityId
                  ? 'Dokument A · von der Duplikatentscheidung betroffen'
                  : 'Dokument B · Vergleichsoriginal'}
              </p>
              <h2>{d.parsed?.number ?? d.filename}</h2>
              <p>
                {d.parsed?.supplier.name} · {d.parsed?.issueDate}
              </p>
              <strong>
                {d.parsed?.totals.payable ?? 'Unbekannter Betrag'}{' '}
                {d.parsed?.currency}
              </strong>
              <p>
                SHA-256:{' '}
                <code style={{ overflowWrap: 'anywhere' }}>{d.hash}</code>
              </p>
              <Link href={`/incoming/${d.id}`}>
                Original und Prüfergebnis öffnen
              </Link>
            </article>
          ))}
        </div>
      )}
      <details>
        <summary>Warum sehe ich diesen Hinweis?</summary>
        <p>
          Regel {a.rule}, Version {a.ruleVersion}. Erkannt am{' '}
          {a.detectedAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.
        </p>
        <dl>
          {Object.entries(a.facts).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v ?? 'Nicht bekannt')}</dd>
            </div>
          ))}
        </dl>
      </details>
      {open && (
        <form action={respondToAction} className="autopilot-controls">
          <input type="hidden" name="id" value={id} />
          <button className="button" name="operation" value="acknowledge">
            Zur Kenntnis genommen
          </button>
          {!a.mandatory && (
            <>
              <button className="button" name="operation" value="snooze">
                Morgen erinnern
              </button>
              <button className="button" name="operation" value="dismiss">
                Hinweis verwerfen
              </button>
            </>
          )}
          {[
            'INVOICE_REQUIRES_REVIEW',
            'DELIVERY_FAILED',
            'PAYMENT_DUE_SOON',
          ].includes(a.rule) && (
            <button className="button" name="operation" value="prepare">
              Checkliste vorbereiten
            </button>
          )}
          <button className="button" name="operation" value="helpful">
            Hilfreich
          </button>
          <button className="button" name="operation" value="irrelevant">
            Nicht relevant
          </button>
          {!a.mandatory && (
            <button className="button" name="operation" value="hide">
              Für mich ausblenden
            </button>
          )}
        </form>
      )}
      {a.relatedId && open && !ticket && (
        <form action={prepareDuplicate}>
          <input type="hidden" name="id" value={id} />
          <button className="button" name="decision" value="DUPLICATE">
            Duplikat bestätigen vorbereiten
          </button>
          <button className="button" name="decision" value="NOT_DUPLICATE">
            Eigenständige Rechnungen bestätigen vorbereiten
          </button>
        </form>
      )}
      {ticket?.operation === 'DUPLICATE_REVIEW' && !ticket.consumedAt ? (
        <form action={confirmDuplicate}>
          <h2>Vergleich ausdrücklich bestätigen</h2>
          <p>
            {ticket.payload.decision === 'DUPLICATE'
              ? 'Dokument A wird als Duplikat markiert und aus dem Ausgabenüberblick ausgeschlossen.'
              : 'Die Rechnungen werden als eigenständige Geschäftsvorgänge eingeordnet.'}{' '}
            Beide Originale bleiben erhalten.
          </p>
          <input type="hidden" name="ticket" value={ticket.id} />
          <button className="button button-primary">
            Vergleich bestätigen
          </button>
        </form>
      ) : ticket?.operation === 'RECORD_PAID' && !ticket.consumedAt ? (
        <form action={confirmPayment}>
          <h2>Zahlung ausdrücklich bestätigen</h2>
          <p>
            Sie bestätigen den vollständigen Betrag von {ticket.payload.amount}{' '}
            EUR am {ticket.payload.paidDay}. Es wird keine Bankzahlung
            ausgeführt. Bestätigung gilt fünf Minuten.
          </p>
          <input type="hidden" name="ticket" value={ticket.id} />
          <button className="button button-primary">
            Vollständige Zahlung bestätigen
          </button>
        </form>
      ) : (
        open &&
        ['INVOICE_OVERDUE', 'PAYABLE_OVERDUE', 'PAYMENT_DUE_SOON'].includes(
          a.rule,
        ) && (
          <form action={preparePayment}>
            <h2>Bereits bezahlt?</h2>
            <input type="hidden" name="id" value={id} />
            <label>
              Tatsächlicher Zahlungstag
              <input type="date" name="paidDay" required />
            </label>
            <button className="button">Bestätigung vorbereiten</button>
          </form>
        )
      )}
    </section>
  );
}
