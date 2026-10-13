import Link from 'next/link';
import { displayMoney } from '@flux/invoice-core';
import type { AutopilotService } from '../../../packages/application/src/autopilot';
export function MorningBrief({
  brief,
  expanded = false,
}: {
  brief: Awaited<ReturnType<AutopilotService['brief']>>;
  expanded?: boolean;
}) {
  const summary = brief.summary;
  return (
    <section className="autopilot-brief panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ERECHNO AUTOPILOT · {brief.today}</p>
          <h2>Was heute Ihre Aufmerksamkeit braucht</h2>
        </div>
        <Link href="/autopilot/settings">Einstellungen</Link>
      </div>
      <p className="muted">
        {brief.actions.length
          ? `${brief.actions.length} offene Hinweise in dieser Übersicht.`
          : 'Aktuell liegen keine offenen Hinweise vor.'}{' '}
        Hinweise werden aus Ihren gespeicherten Rechnungen abgeleitet.
      </p>
      <div className="autopilot-actions">
        {brief.actions.slice(0, expanded ? 25 : 6).map((a) => (
          <Link
            className={`autopilot-card severity-${a.severity.toLowerCase()}`}
            href={`/autopilot/actions/${a.id}`}
            key={a.id}
          >
            <span className="badge">
              {a.severity === 'CRITICAL'
                ? 'Dringend'
                : a.severity === 'WARNING'
                  ? 'Prüfen'
                  : 'Im Blick behalten'}
            </span>
            <h3>{a.title}</h3>
            <p>{a.reason}</p>
            <strong>
              {a.amount ? displayMoney(a.amount) : 'Details ansehen'} →
            </strong>
            <small>
              {a.status === 'IN_PROGRESS'
                ? 'Checkliste vorbereitet · Quelle weiterhin prüfen'
                : 'Hinweis öffnen'}
            </small>
          </Link>
        ))}
      </div>
      {summary ? (
        <>
          <h3>Bekannte Geldbewegungen</h3>
          <div className="metrics">
            <article>
              <p>Erwartete Einnahmen · 7 Tage</p>
              <strong>{displayMoney(summary.data.receivables7)}</strong>
            </article>
            <article>
              <p>Bekannte Ausgaben · 7 Tage</p>
              <strong>{displayMoney(summary.data.payables7)}</strong>
            </article>
            <article>
              <p>Differenz · 30 Tage</p>
              <strong>{displayMoney(summary.data.net30)}</strong>
            </article>
          </div>
          <p className="muted">
            Nach bekannten Zahlungsfristen. Kein Kontostand und keine Zusage
            eines Zahlungseingangs. Stand:{' '}
            {summary.updatedAt.toLocaleString('de-DE', {
              timeZone: 'Europe/Berlin',
            })}
            .
          </p>
        </>
      ) : (
        <p className="muted">
          Der Hintergrunddienst bereitet die erste Übersicht vor. Noch keine
          Prognose verfügbar.
        </p>
      )}
      <div className="section-heading">
        <h3>Zuletzt geändert</h3>
        <Link href="/autopilot/activity">Aktivitäten ansehen</Link>
      </div>
      {brief.activity.slice(0, 3).map((a) => (
        <p key={a.id} className="muted">
          {a.operation === 'checklist_prepared'
            ? 'ERechno hat eine Checkliste vorbereitet'
            : a.operation === 'payment_confirmed'
              ? 'Eine Zahlung wurde bestätigt'
              : a.operation === 'detected'
                ? 'Ein neuer Hinweis wurde erkannt'
                : a.operation === 'terms_confirmed'
                  ? 'Zahlungsbedingungen wurden bestätigt'
                  : a.operation === 'policy_changed'
                    ? 'Die Arbeitsweise wurde geändert'
                    : a.operation === 'resolved'
                      ? 'Ein Hinweis wurde erledigt'
                      : 'Eine Entscheidung wurde protokolliert'}{' '}
          · {a.createdAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
        </p>
      ))}
      <Link className="text-button" href="/autopilot">
        Alle Hinweise und Aktivitäten ansehen →
      </Link>
      <p>
        <Link href="/hilfe/autopilot">
          Hilfe: Autopilot Schritt für Schritt verwenden →
        </Link>
      </p>
    </section>
  );
}
