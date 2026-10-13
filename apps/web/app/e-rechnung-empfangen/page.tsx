import { AutopilotPromotion } from '../../components/autopilot-promotion';
import Link from 'next/link';
import { Marketing, Breadcrumb, StartLink } from '../../components/marketing';
import { publicMetadata } from '../../lib/brand';
export const metadata = publicMetadata(
  'E-Rechnung empfangen und prüfen',
  'Eingangsrechnungen ansehen, prüfen und freigeben. ERechno Autopilot zeigt offene Prüfungen, mögliche Duplikate und bekannte Zahlungsfristen.',
  '/e-rechnung-empfangen',
);
export default function Page() {
  return (
    <Marketing>
      <article className="marketing-section prose">
        <Breadcrumb
          title={'E-Rechnungen empfangen und überblicken'}
          path="/e-rechnung-empfangen"
        />
        <h1>E-Rechnungen empfangen und überblicken</h1>
        <p>
          Bewahren Sie eingegangene Originale in Ihrem Arbeitsbereich auf, sehen
          Sie Rechnungsdaten an und kontrollieren Sie die Prüfungsergebnisse.
        </p>
        <h2>Eingang bedeutet noch keine Freigabe</h2>
        <p>
          Eine technisch lesbare Rechnung kann trotzdem falsche Beträge oder
          Leistungen enthalten. Prüfen Sie den Geschäftsvorgang selbst, bevor
          Sie ihn freigeben. ERechno führt keine Zahlung aus.
        </p>
        <h2>So starten Sie</h2>
        <ol>
          <li>Registrieren und den Arbeitsbereich einrichten.</li>
          <li>Im Rechnungseingang eine Datei auswählen.</li>
          <li>
            Prüfergebnisse ansehen und Original mit Geschäftsvorgang abgleichen.
          </li>
        </ol>
        <p>
          Der Rechnungseingang unterstützt UBL- und CII-Rechnungsdaten sowie die
          vorhandene Dokumentaufnahme. Ein automatisches E-Mail-Postfach oder
          Peppol-Empfang ist noch nicht angebunden.
        </p>
        <Link href="/incoming">Rechnungseingang öffnen →</Link>
        <div className="marketing-actions">
          <StartLink />
        </div>
      </article>
      <AutopilotPromotion />
    </Marketing>
  );
}
