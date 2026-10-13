import Link from 'next/link';
import {
  Marketing,
  Breadcrumb,
  StartLink,
  StructuredData,
} from '../../../components/marketing';
import { publicMetadata, APP_URL } from '../../../lib/brand';
const pageMetadata = publicMetadata(
  'Rechnungen und Zahlungsfristen im Blick: ERechno Autopilot',
  'Überfällige Rechnungen, Skontofristen und Duplikate erkennen. ERechno Autopilot erklärt Ihren Handlungsbedarf und zeigt bekannte Geldbewegungen.',
  '/funktionen/autopilot',
  [
    'ERechno Autopilot',
    'Rechnungen verwalten',
    'überfällige Rechnungen',
    'Skontofristen',
    'Cashflow Übersicht',
    'doppelte Eingangsrechnungen',
  ],
);
export const metadata = {
  ...pageMetadata,
  openGraph: {
    ...pageMetadata.openGraph,
    images: [
      {
        url: '/funktionen/autopilot/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'ERechno Autopilot: Rechnungen und Fristen im Blick',
      },
    ],
  },
  twitter: {
    ...pageMetadata.twitter,
    images: ['/funktionen/autopilot/opengraph-image'],
  },
};

const features = [
  [
    'Ihr Morning Brief',
    'Was braucht heute Ihre Aufmerksamkeit? Der Morning Brief ordnet offene Hinweise nach Dringlichkeit und verlinkt die zugrunde liegenden Rechnungen.',
  ],
  [
    'Überfällige Rechnungen erkennen',
    'Sehen Sie offene Kundenrechnungen und freigegebene Lieferantenrechnungen mit überschrittener Zahlungsfrist. Einen tatsächlichen Zahlungseingang bestätigen Sie selbst.',
  ],
  [
    'Zahlungs- und Skontofristen verfolgen',
    'Bekannte Zahlungsfristen der nächsten sieben Tage und ausdrücklich bestätigte Skontofristen der nächsten drei Tage erscheinen als Hinweise.',
  ],
  [
    'Doppelte Eingangsrechnungen vergleichen',
    'Gleiche Dateien oder übereinstimmende Lieferanten und Rechnungsnummern können auf ein Duplikat hinweisen. Vergleichen Sie beide Originale, bevor Sie die Zuordnung bestätigen.',
  ],
  [
    'Prüf- und Versandprobleme finden',
    'Offene Eingangsprüfungen, fehlgeschlagene XRechnungsprüfungen und fehlgeschlagene oder zurückgewiesene Zustellungen führen direkt zum bestehenden Prüf- oder Versandprozess.',
  ],
  [
    'Bekannte Geldbewegungen überblicken',
    'Die Übersicht zeigt erwartete Einnahmen, bekannte Ausgaben und deren Differenz für sieben und 30 Tage. Grundlage sind gespeicherte Rechnungen und bekannte Zahlungsfristen, kein Bankkontostand.',
  ],
  [
    'Zahlungsverhalten nachvollziehen',
    'Aus bestätigten Zahlungsdaten sehen Sie, wie lange Kunden durchschnittlich zum Bezahlen brauchen. Veränderungen werden bei ausreichenden Vergleichsdaten sichtbar.',
  ],
  [
    'Entscheidungen wiederfinden',
    'Hinweise, bestätigte Zahlungen und automatische Vorbereitungen bleiben im Aktivitätsverlauf nachvollziehbar. Jeder Hinweis erklärt seine Grundlage.',
  ],
];
export default function Page() {
  return (
    <Marketing>
      <section className="marketing-hero">
        <div>
          <Breadcrumb title="ERechno Autopilot" path="/funktionen/autopilot" />
          <p className="eyebrow">WENIGER SUCHEN. KLARER ENTSCHEIDEN.</p>
          <h1>Wissen, welche Rechnung heute wichtig ist.</h1>
          <p className="hero-description">
            ERechno Autopilot bringt Rechnungen, Fristen und nächste Schritte
            zusammen. Verständliche Hinweise statt einer Liste, die Sie jeden
            Morgen selbst durchsuchen müssen.
          </p>
          <div className="marketing-actions">
            <StartLink />
            <Link className="button button-outline" href="/hilfe/autopilot">
              Anleitung ansehen
            </Link>
          </div>
          <p>
            In Free, Starter, Business und Pro enthalten. Drei ausgestellte
            Rechnungen pro Monat sind im Free-Tarif kostenlos.
          </p>
        </div>
        <aside
          className="hero-workflow"
          aria-label="So unterstützt Sie Autopilot"
        >
          <p className="eyebrow">IHR START IN DEN TAG</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Überblick bekommen</strong>
                <p>Morning Brief öffnen und die wichtigsten Hinweise sehen.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Grundlage verstehen</strong>
                <p>Erklärung, Frist und Originalrechnung prüfen.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Bewusst entscheiden</strong>
                <p>
                  Die passende Handlung öffnen oder eine unterstützte
                  Entscheidung bestätigen.
                </p>
              </div>
            </li>
          </ol>
          <p className="workflow-note">
            Ihre nächsten Schritte – aus Ihren gespeicherten Rechnungen
            abgeleitet.
          </p>
        </aside>
      </section>
      <section className="marketing-section">
        <h2>Von offenen Fragen zu klaren nächsten Schritten</h2>
        <div className="marketing-grid">
          {features.map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="marketing-section">
        <h2>Sie bestimmen, was ERechno vorbereitet.</h2>
        <div className="marketing-grid">
          <article>
            <h3>Manuell</h3>
            <p>
              ERechno erkennt und erklärt Hinweise. Sie entscheiden über den
              nächsten Schritt.
            </p>
          </article>
          <article>
            <h3>Assistiert</h3>
            <p>
              Sie lassen unterstützte interne Checklisten auf Wunsch vorbereiten
              und führen die eigentliche Handlung bewusst aus.
            </p>
          </article>
          <article>
            <h3>Autopilot</h3>
            <p>
              Erlaubte Checklisten für Eingangsprüfung, Versandprobleme und
              Zahlungsfristen werden automatisch vorbereitet. Das erledigt die
              zugrunde liegende Prüfung noch nicht.
            </p>
          </article>
        </div>
      </section>
      <section className="marketing-section prose">
        <h2>Unterstützung mit klaren Grenzen</h2>
        <p>
          Autopilot ändert keine ausgestellten Rechnungen, löst keine
          Banküberweisungen aus und trifft keine Steuerentscheidungen. Zahlung
          und Duplikatzuordnung benötigen eine ausdrückliche Bestätigung. Eine
          Bankanbindung und automatische Erinnerungs-E-Mails sind derzeit nicht
          enthalten.
        </p>
        <p>
          Die Übersicht basiert auf Ihren gespeicherten Daten. Fehlende
          Zahlungsdaten bleiben unbekannt; eine mögliche Dublette ist erst nach
          Ihrer Prüfung eine bestätigte Zuordnung.
        </p>
        <Link href="/sicherheit">
          Mehr über den Umgang mit Ihren Rechnungsdaten
        </Link>
        <h2>Mit Ihren ersten Rechnungen starten</h2>
        <p>
          Registrieren Sie sich, richten Sie Ihr Unternehmen ein und erstellen
          oder importieren Sie Ihre Rechnungen. Autopilot sammelt daraus
          nachvollziehbare Hinweise in Ihrer Übersicht.
        </p>
        <div className="marketing-actions">
          <StartLink />
          <Link href="/preise">Alle Tarife ansehen →</Link>
        </div>
      </section>
      <StructuredData
        value={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'ERechno Autopilot',
          url: APP_URL + '/funktionen/autopilot',
          description:
            'Rechnungen, Zahlungsfristen, Prüfprobleme und bekannte Geldbewegungen übersichtlich verfolgen.',
          about: {
            '@type': 'SoftwareApplication',
            name: 'ERechno',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            featureList: features.map(([title]) => title),
          },
        }}
      />
    </Marketing>
  );
}
