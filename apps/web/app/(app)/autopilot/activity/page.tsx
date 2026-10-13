import { activityLabels } from '../../../../lib/autopilot-labels';
import Link from 'next/link';
import { autopilot, principal } from '../../../../lib/server';
export default async function History({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { before } = await searchParams;
  const history = await autopilot.history(await principal(), before);
  return (
    <section className="panel">
      <Link href="/autopilot">← Autopilot</Link>
      <h1>Vollständige Aktivitäten</h1>
      <p>
        Entscheidungen und automatische Vorbereitungen mit gespeichertem
        Faktenstand. Jeder Eintrag ist zusätzlich im bestehenden Auditprotokoll
        verankert.
      </p>
      {history.rows.map((a) => (
        <article className="panel" key={a.id}>
          <h2>{activityLabels[a.operation] ?? 'Aktivität'}</h2>
          <p>
            {a.createdAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}{' '}
            · {a.actorId === 'SYSTEM_AUTOPILOT' ? 'ERechno' : 'Benutzer'}
            {a.rule ? ` · ${a.rule}, Version ${a.ruleVersion}` : ''}
          </p>
          {a.actionId && (
            <Link href={`/autopilot/actions/${a.actionId}`}>
              Hinweis und Quelle ansehen
            </Link>
          )}
          <details>
            <summary>Gespeicherter Faktenstand</summary>
            <dl>
              {Object.entries(a.facts).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value ?? 'Nicht bekannt')}</dd>
                </div>
              ))}
            </dl>
          </details>
        </article>
      ))}
      {history.next && (
        <Link
          className="button"
          href={`/autopilot/activity?before=${history.next}`}
        >
          Ältere Aktivitäten
        </Link>
      )}
    </section>
  );
}
