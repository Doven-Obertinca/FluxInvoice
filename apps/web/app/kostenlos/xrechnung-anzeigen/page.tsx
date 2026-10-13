import Link from 'next/link';
import {
  Marketing,
  Breadcrumb,
  StartLink,
} from '../../../components/marketing';
import { PublicXmlViewer } from '../../../components/public-xml-viewer';
import { publicMetadata } from '../../../lib/brand';
export const metadata = publicMetadata(
  'XRechnung kostenlos anzeigen – XML-Viewer',
  'UBL- und CII-Rechnungsdaten lokal im Browser ansehen. Ohne Anmeldung oder Upload. Die Anzeige ersetzt keine Validierung.',
  '/kostenlos/xrechnung-anzeigen',
);
export default function Viewer() {
  return (
    <Marketing>
      <section className="marketing-section prose">
        <Breadcrumb
          title="XRechnung anzeigen"
          path="/kostenlos/xrechnung-anzeigen"
        />
        <h1>XRechnung kostenlos anzeigen</h1>
        <p>
          Rechnungsnummer, Geschäftspartner und Zahlbetrag einer XML-Rechnung
          lesen – ohne Anmeldung.
        </p>
        <PublicXmlViewer />
        <h2>Unterstützte Dateien</h2>
        <p>
          UBL-Invoice und CII als XML, maximal 2 MB. ZUGFeRD-PDFs, andere PDFs
          und Bilder werden hier nicht geöffnet. Einzelne optionale Angaben
          können in dieser vereinfachten Anzeige fehlen.
        </p>
        <h2>Datenschutz bei der Anzeige</h2>
        <p>
          Die Datei wird lokal in Ihrem Browser gelesen und nicht hochgeladen.
          Mit „Anzeige löschen“ oder dem Schließen der Seite entfernen Sie die
          angezeigten Daten. Der Viewer speichert sie nicht.
        </p>
        <details>
          <summary>Ist eine lesbare Rechnung automatisch gültig?</summary>
          <p>
            Nein. Die Anzeige prüft keine fachlichen oder steuerlichen Regeln.
            Für die technische XRechnung-Prüfung ist ein geeignetes Regelwerk
            notwendig.
          </p>
        </details>
        <details>
          <summary>Wie erstelle ich selbst eine XRechnung?</summary>
          <p>
            Registrieren Sie sich kostenlos. ERechno führt Sie durch die
            Erfassung und Prüfung vor der Ausstellung.
          </p>
        </details>
        <div className="marketing-actions">
          <StartLink />
          <Link href="/xrechnung">XRechnung erstellen</Link>
        </div>
      </section>
    </Marketing>
  );
}
