import { runtimeCapabilities } from '@flux/shared';
import { AutopilotPromotion } from '../../components/autopilot-promotion';
import Link from 'next/link';
import { Marketing, Breadcrumb, StartLink } from '../../components/marketing';
import { publicMetadata } from '../../lib/brand';
export const metadata = publicMetadata(
  'XRechnung erstellen – einfach online',
  'XRechnungen online erstellen und prüfen. ERechno Autopilot hält danach offene Aufgaben und Zahlungsfristen im Blick. 3 Rechnungen monatlich kostenlos.',
  '/xrechnung',
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
        <Breadcrumb title={'XRechnung erstellen'} path="/xrechnung" />
        <h1>XRechnung erstellen</h1>
        <p>
          Erfassen Sie Kunde und Leistungen. ERechno prüft die Angaben und zeigt
          Hinweise an, bevor Sie die Rechnung endgültig ausstellen.
        </p>
        <h2>In drei Schritten zur Originaldatei</h2>
        <ol>
          <li>
            Kostenlos registrieren, E-Mail bestätigen und Firmendaten
            hinterlegen.
          </li>
          <li>
            Kunde auswählen, Leistungen erfassen und die Rechnung prüfen lassen.
          </li>
          <li>
            Angaben kontrollieren, Ausstellung bestätigen und die XRechnung
            herunterladen oder senden.
          </li>
        </ol>
        <h2>Welche Rechnungen werden unterstützt?</h2>
        <p>
          Inländische deutsche EUR-Rechnungen mit 19 % und 7 % Umsatzsteuer. Die
          ausgestellte Datei ist XRechnung in UBL. Steuerbefreiungen,
          Gutschriften und ausländische Rechnungen sind noch nicht unterstützt.
        </p>
        <h2>Eine XML-Datei erhalten?</h2>
        <p>
          Unser kostenloser Viewer zeigt Rechnungsdaten im Browser an. Die
          Anzeige ersetzt keine offizielle Prüfung.
        </p>
        <Link href="/kostenlos/xrechnung-anzeigen">
          XRechnung kostenlos ansehen →
        </Link>
        <div className="marketing-actions">
          <StartLink />
        </div>
      </article>
      <AutopilotPromotion />
    </Marketing>
  );
}
