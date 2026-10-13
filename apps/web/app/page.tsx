import { AutopilotPromotion } from '../components/autopilot-promotion';
import Link from 'next/link';
import {
  APP_NAME,
  PLANS,
  planPrice,
  SEO_DEFAULT_TITLE,
  runtimeCapabilities,
} from '@flux/shared';
import { Marketing, StartLink, StructuredData } from '../components/marketing';
import { APP_URL, publicMetadata, defaultDescription } from '../lib/brand';
export const metadata = {
  ...publicMetadata(SEO_DEFAULT_TITLE, defaultDescription, '/', [
    'E-Rechnung kostenlos erstellen',
    'XRechnung',
    'ERechno Autopilot',
    'Rechnungen verwalten',
  ]),
  title: { absolute: SEO_DEFAULT_TITLE, runtimeCapabilities },
};
export default function Home() {
  if (runtimeCapabilities().beta)
    return (
      <Marketing>
        <section className="marketing-hero">
          <div>
            <p className="eyebrow">ERECHNO BETA</p>
            <h1>Rechnungsentwürfe einfach vorbereiten</h1>
            <p className="hero-description">
              Kunden verwalten, Rechnungsentwürfe erstellen und Dokumente im
              Browser lesen. Die rechtskonforme Finalisierung, Archivierung und
              der Rechnungsversand sind noch nicht aktiviert.
            </p>
            <div className="marketing-actions">
              <StartLink />
            </div>
            <p className="muted">
              Kostenlos testen · Keine Kreditkarte erforderlich
            </p>
          </div>
        </section>
      </Marketing>
    );
  return (
    <Marketing>
      <section className="marketing-hero">
        <div>
          <p className="eyebrow">FÜR UNTERNEHMEN IN DEUTSCHLAND</p>
          <h1>
            E-Rechnung
            <br />
            <span>kostenlos erstellen</span>
          </h1>
          <p className="hero-description">
            Mit {APP_NAME} erstellen Sie XRechnungen einfach online.{' '}
            {PLANS.FREE.monthlyInvoiceLimit} Rechnungen pro Monat kostenlos –
            mit verständlichen Schritten und einer Prüfung vor der Ausstellung.
            Autopilot hält danach offene Aufgaben und Zahlungsfristen im Blick.
          </p>
          <div className="marketing-actions">
            <StartLink />
            <Link className="button button-outline" href="/invoices/new">
              E-Rechnung erstellen
            </Link>
          </div>
          <p className="muted">
            {PLANS.FREE.monthlyInvoiceLimit} Rechnungen/Monat kostenlos · Keine
            Kreditkarte erforderlich
          </p>
          <p>
            Mehr Rechnungen? Starter ist ab {planPrice('STARTER')}/Monat
            geplant.
          </p>
        </div>
        <aside
          className="hero-workflow"
          aria-label="Von den Angaben zur Rechnung"
        >
          <p className="eyebrow">IHRE ERSTE E-RECHNUNG</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Kunde & Leistungen</strong>
                <p>
                  Angaben eintragen oder aus einem Dokument übernehmen und
                  prüfen.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Prüfen lassen</strong>
                <p>
                  Hinweise zur XRechnung sehen und fehlende Angaben ergänzen.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Ausstellen & direkt senden</strong>
                <p>
                  Rechnung bestätigen, herunterladen oder mit vorbereitetem
                  E-Mail-Text und Anhang senden.
                </p>
              </div>
            </li>
          </ol>
          <p className="workflow-note">
            Entwürfe zählen nicht zum Monatslimit.
          </p>
        </aside>
      </section>
      <AutopilotPromotion />
      <section className="marketing-section">
        <p className="eyebrow">EINFACH ANFANGEN</p>
        <h2>Das Wesentliche an einem Ort.</h2>
        <div className="marketing-grid">
          <article>
            <h3>XRechnung erstellen</h3>
            <p>
              Kunden verwalten, Leistungen erfassen und Rechnungen vor dem
              Ausstellen prüfen lassen.
            </p>
            <Link href="/xrechnung">So funktioniert es →</Link>
          </article>
          <article>
            <h3>Rechnungen empfangen</h3>
            <p>
              Originale aufbewahren, Rechnungsdaten ansehen und den Eingang
              bewusst prüfen.
            </p>
            <Link href="/e-rechnung-empfangen">Zum Rechnungseingang →</Link>
          </article>
          <article>
            <h3>XML-Datei ansehen</h3>
            <p>
              UBL- und CII-Rechnungsdaten kostenlos im Browser lesen, ohne Konto
              oder Upload.
            </p>
            <Link href="/kostenlos/xrechnung-anzeigen">
              Kostenlosen Viewer öffnen →
            </Link>
          </article>
        </div>
      </section>
      <section className="marketing-section">
        <h2>Einlesen statt abtippen. Senden ohne Textarbeit.</h2>
        <div className="marketing-grid">
          <article>
            <h3>PDFs und Fotos einlesen</h3>
            <p>
              Angaben aus einer Rechnung oder einem Dokument erkennen lassen,
              selbst prüfen und als Rechnungsentwurf übernehmen.
            </p>
            <Link href="/invoices/import">Aus Dokument erstellen →</Link>
          </article>
          <article>
            <h3>QR-Codes scannen</h3>
            <p>
              Mit der Kamera oder aus einem Bild lesen und passende Angaben
              übernehmen. Ein Zahlungs-QR ergänzt Daten; Ihre Prüfung bleibt
              nötig.
            </p>
            <Link href="/invoices/import">QR-Code einlesen →</Link>
          </article>
          <article>
            <h3>Direkt per E-Mail senden</h3>
            <p>
              Nach Prüfung und Ausstellung sind Empfänger, Betreff, Nachricht
              und XRechnung-Anhang vorbereitet. Kein eigener Text nötig –
              Vorschau prüfen und Versand bestätigen.
            </p>
            <Link href="/hilfe">So funktioniert der Versand →</Link>
          </article>
        </div>
      </section>
      <section className="marketing-section marketing-tint">
        <h2>Ein echter kostenloser Einstieg.</h2>
        <p>
          Bis zu {PLANS.FREE.monthlyInvoiceLimit} ausgestellte Rechnungen pro
          Kalendermonat. Entwürfe, Prüfungen und Downloads verbrauchen keine
          zusätzlichen Rechnungen.
        </p>
        <StartLink />
        <Link href="/preise">Tarife vergleichen</Link>
      </section>
      <section className="marketing-section">
        <h2>Passt ERechno zu Ihrem Unternehmen?</h2>
        <p>
          Aktuell unterstützt ERechno inländische EUR-Rechnungen mit 19 % und 7
          % Umsatzsteuer. ZUGFeRD-Erstellung, Rechnungs-PDFs, steuerfreie
          Kleinunternehmer-Rechnungen und DATEV sind noch nicht verfügbar.
        </p>
        <Link href="/ratgeber/xrechnung-oder-zugferd">
          XRechnung und ZUGFeRD verstehen
        </Link>
        <details>
          <summary>Was zählt zu den kostenlosen Rechnungen?</summary>
          <p>
            Eine erfolgreich ausgestellte Rechnung zählt einmal. Ein Entwurf
            oder eine fehlgeschlagene Prüfung zählt nicht. Laufende
            Ausstellungen reservieren vorübergehend einen Platz.
          </p>
        </details>
        <details>
          <summary>Brauche ich eine Kreditkarte?</summary>
          <p>
            Für die Registrierung und den Free-Tarif benötigen Sie keine
            Kreditkarte.
          </p>
        </details>
        <details>
          <summary>Kann ich Angaben aus einem Foto übernehmen?</summary>
          <p>
            Ja. Der lokale Dokumentleser schlägt Angaben vor. Prüfen Sie diese
            selbst, bevor Sie speichern oder ausstellen.
          </p>
        </details>
      </section>
      <StructuredData
        value={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: APP_NAME,
          url: APP_URL,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: defaultDescription,
          featureList: [
            'XRechnung erstellen und prüfen',
            'Dokumentleser und QR-Scanner',
            'Vorbereiteter E-Mail-Versand',
            'Autopilot Morning Brief',
            'Zahlungs- und Skontofristen',
            'Duplikatvergleich',
            'Bekannte Geldbewegungen',
          ],
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'EUR',
            description:
              'Bis zu 3 ausgestellte Rechnungen pro Kalendermonat kostenlos',
          },
        }}
      />
    </Marketing>
  );
}
