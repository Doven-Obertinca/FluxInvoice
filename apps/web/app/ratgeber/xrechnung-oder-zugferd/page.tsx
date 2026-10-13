import Link from 'next/link';
import {
  Marketing,
  Breadcrumb,
  StartLink,
} from '../../../components/marketing';
import { publicMetadata } from '../../../lib/brand';
export const metadata = publicMetadata(
  'XRechnung oder ZUGFeRD: Formate erklärt',
  'Der Unterschied zwischen XML-Rechnung und PDF mit eingebetteten Rechnungsdaten – und was ERechno heute unterstützt.',
  '/ratgeber/xrechnung-oder-zugferd',
);
export default function Page() {
  return (
    <Marketing>
      <article className="marketing-section prose">
        <Breadcrumb
          title={'XRechnung oder ZUGFeRD?'}
          path="/ratgeber/xrechnung-oder-zugferd"
        />
        <h1>XRechnung oder ZUGFeRD?</h1>
        <p>
          Beide Formate transportieren strukturierte Rechnungsdaten.
          Entscheidend ist, welches Format Ihr Empfänger benötigt und welche
          Anforderungen die konkrete Rechnung erfüllt.
        </p>
        <h2>XRechnung</h2>
        <p>
          XRechnung verwendet strukturierte XML-Daten in UBL oder CII. Zum
          komfortablen Lesen hilft ein Viewer. ERechno erstellt aktuell
          XRechnung in UBL.
        </p>
        <h2>ZUGFeRD</h2>
        <p>
          ZUGFeRD verbindet eine lesbare PDF/A-3-Datei mit eingebetteten
          strukturierten XML-Rechnungsdaten. Eine gewöhnliche PDF wird durch
          ihre Dateiendung nicht zur ZUGFeRD-Rechnung. ERechno erstellt derzeit
          keine ZUGFeRD-Dateien.
        </p>
        <h2>Was sollten Sie wählen?</h2>
        <p>
          Klären Sie zuerst das verlangte Format und den Übermittlungsweg beim
          Empfänger. Eine erfolgreiche technische Prüfung ersetzt weder die
          Kontrolle der Geschäftsdaten noch die Vorgaben des Empfängers.
        </p>
        <h2>Offizielle Informationen</h2>
        <ul>
          <li>
            <a href="https://xeinkauf.de/xrechnung/faq">
              XStandards Einkauf: XRechnung-FAQ
            </a>
          </li>
          <li>
            <a href="https://www.ferd-net.de/standards/zugferd">
              FeRD: ZUGFeRD und Factur-X
            </a>
          </li>
        </ul>
        <p>Quellen geprüft am 12. Oktober 2026.</p>
        <Link href="/kostenlos/xrechnung-anzeigen">
          XML-Rechnung kostenlos ansehen →
        </Link>
        <div className="marketing-actions">
          <StartLink />
        </div>
      </article>
    </Marketing>
  );
}
