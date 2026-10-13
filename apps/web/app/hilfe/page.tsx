import Link from 'next/link';
import { Marketing, Breadcrumb, StartLink } from '../../components/marketing';
import { publicMetadata } from '../../lib/brand';
export const metadata = publicMetadata(
  'Hilfe: E-Rechnung erstellen und Autopilot verwenden',
  'Anleitungen für ERechno: XRechnung erstellen, Dokumente lesen, Rechnungen senden und Autopilot für Fristen und nächste Schritte nutzen.',
  '/hilfe',
);
export default function Page() {
  return (
    <Marketing>
      <article className="marketing-section prose">
        <Breadcrumb title={'Was möchten Sie als Nächstes tun?'} path="/hilfe" />
        <h1>Was möchten Sie als Nächstes tun?</h1>
        <section className="autopilot-help-callout">
          <p className="eyebrow">NEU: ERECHNO AUTOPILOT</p>
          <h2>Was braucht heute Ihre Aufmerksamkeit?</h2>
          <p>
            Morning Brief öffnen, Hinweise verstehen, Zahlungen bewusst
            bestätigen und Zahlungsfristen im Blick behalten.
          </p>
          <Link className="button button-primary" href="/hilfe/autopilot">
            Autopilot Schritt für Schritt lernen
          </Link>
          <p>
            <Link href="/funktionen/autopilot">
              Alle Autopilot-Funktionen entdecken →
            </Link>
          </p>
        </section>
        <h2>Erste Rechnung erstellen</h2>
        <ol>
          <li>
            E-Mail-Adresse bestätigen und Firmendaten vollständig erfassen.
          </li>
          <li>Unter „Kunden“ einen Rechnungsempfänger anlegen.</li>
          <li>Unter „Neue Rechnung“ Leistungen und Preise eintragen.</li>
          <li>Prüfen lassen und Hinweise bearbeiten.</li>
          <li>Angaben bestätigen und die Rechnung ausstellen.</li>
        </ol>
        <h2>Prüfung meldet fehlende Angaben</h2>
        <p>
          Ergänzen Sie die genannten Kunden- oder Firmendaten. Speichern Sie den
          Entwurf erneut, damit die aktuellen Angaben in die Rechnung übernommen
          werden.
        </p>
        <h2>Monatslimit erreicht</h2>
        <p>
          Ihre ausgestellten Rechnungen bleiben erreichbar. Sie können weiterhin
          Entwürfe bearbeiten. Im nächsten Kalendermonat stehen die kostenlosen
          Plätze wieder bereit.
        </p>
        <Link href="/preise">Tarife und Zählweise ansehen →</Link>
        <h2>Aus einer Datei starten</h2>
        <p>
          Mit „Aus Dokument erstellen“ lesen Sie Angaben aus Foto oder PDF.
          Kontrollieren Sie jedes vorgeschlagene Feld, insbesondere Beträge,
          Steuern und Empfänger.
        </p>
        <h2>QR-Code lesen</h2>
        <p>
          Unter „Aus Dokument erstellen“ wählen Sie „QR-Code“. Scannen Sie den
          Code mit der Kamera oder lesen Sie ihn aus einem Bild. Kontrollieren
          Sie die erkannten Angaben, bevor Sie sie übernehmen.
        </p>
        <h2>Rechnung senden, ohne einen Text zu schreiben</h2>
        <p>
          Nach erfolgreicher Prüfung und Ausstellung wählen Sie „Rechnung
          senden“. ERechno bereitet Empfänger, Betreff und Nachricht vor und
          hängt die ausgestellte XRechnung automatisch an. Öffnen Sie die
          Vorschau, kontrollieren Sie den Empfänger und bestätigen Sie den
          Versand.
        </p>
        <div className="marketing-actions">
          <StartLink />
        </div>
      </article>
    </Marketing>
  );
}
