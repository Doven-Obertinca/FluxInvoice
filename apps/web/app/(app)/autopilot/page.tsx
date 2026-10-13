import { activityLabels } from '../../../lib/autopilot-labels';
import Link from 'next/link';
import { autopilot, principal } from '../../../lib/server';
import { MorningBrief } from '../../../components/morning-brief';
export default async function Autopilot() {
  const brief = await autopilot.brief(await principal());
  return (
    <>
      <MorningBrief brief={brief} expanded />
      <section className="panel">
        <h2>Zahlungsverhalten Ihrer Kunden</h2>
        <p className="muted">
          Aus ausdrücklich bestätigten Zahlungen, höchstens die letzten 250 je
          Kunde. Ohne bestätigte Zahlungsdaten ist keine Auswertung möglich.
        </p>
        {brief.metrics
          .filter((m) => m.data.sampleSize > 0)
          .map((m) => (
            <div className="queue-row" key={m.name}>
              <span>
                {m.name} · {m.data.sampleSize} bestätigte Zahlungen
              </span>
              <strong>
                Ø {m.data.averageDays?.toFixed(1)} Tage
                {m.data.deteriorating ? ' · zuletzt langsamer' : ''}
              </strong>
            </div>
          ))}
      </section>
      <section className="panel">
        <h2>Aktivitäten</h2>
        <Link href="/autopilot/activity">Vollständigen Verlauf ansehen</Link>
        {brief.activity.length ? (
          brief.activity.map((a) => (
            <div className="queue-row" key={a.id}>
              <span>{activityLabels[a.operation] ?? 'Aktivität'}</span>
              <small>
                {a.actorId === 'SYSTEM_AUTOPILOT' ? 'ERechno' : 'Benutzer'} ·{' '}
                {a.createdAt.toLocaleString('de-DE', {
                  timeZone: 'Europe/Berlin',
                })}
              </small>
            </div>
          ))
        ) : (
          <p>Noch keine Aktivitäten.</p>
        )}
      </section>
      <section className="panel">
        <h2>Tagesbericht</h2>
        {brief.digest ? (
          <>
            <p>
              {brief.digest.content.count} Hinweise in der letzten
              Zusammenfassung.
            </p>
            <ul>
              {brief.digest.content.titles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Noch kein Tagesbericht vorhanden.</p>
        )}
        <p className="muted">
          Interner Bericht. Es werden keine E-Mails automatisch versendet.
        </p>
      </section>
    </>
  );
}
