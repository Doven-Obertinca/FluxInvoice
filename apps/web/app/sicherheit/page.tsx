import { runtimeCapabilities } from '@flux/shared';
import Link from 'next/link';
import { Marketing, Breadcrumb, StartLink } from '../../components/marketing';
import { publicMetadata } from '../../lib/brand';
export const metadata = publicMetadata(
  'Sicherheit und Umgang mit Rechnungsdaten',
  'Wie ERechno Zugriffe trennt, Originale schützt und Autopilot-Entscheidungen durch serverseitige Bestätigungen und nachvollziehbare Aktivitäten absichert.',
  '/sicherheit',
);
export default function Page() {
  if (runtimeCapabilities().beta)
    return (
      <Marketing>
        <article className="marketing-section prose">
          <h1>Rechnungen sicher vorbereiten</h1>
          <p>
            In der ERechno Beta können Sie Kunden verwalten, Rechnungsentwürfe
            bearbeiten und Dokumente im Browser lesen.
          </p>
          <p>
            Die rechtskonforme Finalisierung und Archivierung, die
            KoSIT-Prüfung, der Rechnungsversand und die Archivierung eingehender
            Rechnungen sind noch nicht aktiviert.
          </p>
          <p>
            Anmeldung und Berechtigungen werden weiterhin auf dem Server
            geprüft. Eine Dokumentanzeige ersetzt keine offizielle Prüfung.
          </p>
          <StartLink />
        </article>
      </Marketing>
    );
  return (
    <Marketing>
      <article className="marketing-section prose">
        <Breadcrumb
          title={'Ihre Rechnungen verdienen Sorgfalt.'}
          path="/sicherheit"
        />
        <h1>Ihre Rechnungen verdienen Sorgfalt.</h1>
        <h2>Zugriff im eigenen Arbeitsbereich</h2>
        <p>
          Anmeldung, Mitgliedschaft und Berechtigungen werden auf dem Server
          geprüft. Rechnungen und Kunden werden dem jeweiligen Unternehmen
          zugeordnet.
        </p>
        <h2>Vor dem Ausstellen prüfen</h2>
        <p>
          Die XRechnung wird vor der Ausstellung mit dem offiziellen
          KoSIT-Regelwerk geprüft. Ausgestellte Originaldateien werden nicht bei
          jedem Download neu erstellt.
        </p>
        <h2>Dokumenterkennung mit Ihrer Kontrolle</h2>
        <p>
          Der Dokumentleser arbeitet lokal im Browser. Erst ausdrücklich
          bestätigte Angaben werden als Entwurf an ERechno übertragen. Eine
          Erkennung stellt nie automatisch eine Rechnung aus.
        </p>
        <h2>Autopilot mit Ihrer Kontrolle</h2>
        <p>
          Hinweise basieren auf gespeicherten Rechnungsdaten und
          nachvollziehbaren Regeln. Zahlung und Duplikatzuordnung benötigen eine
          ausdrückliche, zeitlich begrenzte Bestätigung, die auf dem Server
          geprüft wird. Ausgestellte Originale bleiben unverändert.
        </p>
        <p>
          Automatische Vorbereitung ist auf ausdrücklich erlaubte interne
          Checklisten beschränkt. Autopilot löst keine Bankzahlung aus und
          trifft keine Steuerentscheidung. Entscheidungen und Vorbereitungen
          bleiben im Aktivitätsverlauf nachvollziehbar.
        </p>
        <Link href="/hilfe/autopilot">Autopilot sicher verwenden →</Link>
        <h2>Archiv und Betrieb</h2>
        <p>
          Produktionsbetrieb erfordert einen geschützten Archivspeicher und
          verschlüsselte Verbindungen. Lokale Entwicklungsdateien sind kein
          unveränderbares regulatorisches Archiv. Eine technische Prüfung
          garantiert weder die richtige steuerliche Behandlung noch die Annahme
          beim Empfänger.
        </p>
        <div className="marketing-actions">
          <StartLink />
        </div>
      </article>
    </Marketing>
  );
}
