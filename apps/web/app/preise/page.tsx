import { AutopilotPromotion } from '../../components/autopilot-promotion';
import Link from 'next/link';
import { PlanCards } from '../../components/plan-cards';
import { Marketing, Breadcrumb } from '../../components/marketing';
import { publicMetadata } from '../../lib/brand';
export const metadata = publicMetadata(
  'Preise: 3 E-Rechnungen pro Monat kostenlos',
  'ERechno mit Autopilot, Dokumentleser und E-Mail-Versand: 3 Rechnungen monatlich kostenlos. Weitere Tarife ab 3,99 € für mehr Rechnungen.',
  '/preise',
  [
    'ERechno Preise',
    'Autopilot inklusive',
    'E-Rechnung kostenlos',
    'Rechnungssoftware',
  ],
);
export default function Pricing() {
  return (
    <Marketing>
      <section className="marketing-section">
        <Breadcrumb title="Preise" path="/preise" />
        <p className="eyebrow">TRANSPARENTE TARIFE</p>
        <h1>3 E-Rechnungen pro Monat kostenlos.</h1>
        <p>
          Starten Sie kostenlos oder wählen Sie mehr Platz für Ihre Rechnungen.
          Alle Tarife enthalten Autopilot, QR-Scanner, Dokumentleser und
          E-Mail-Versand.
        </p>
        <PlanCards />
        <p className="pricing-payment-note">
          Wählen Sie Ihren Tarif. Kostenpflichtige Tarife werden erst nach einer
          bestätigten Zahlung aktiviert.
        </p>
        <h2>Weniger abtippen. Schneller versenden.</h2>
        <p>
          PDF oder Foto einlesen, QR-Code scannen und die erkannten Angaben für
          einen Rechnungsentwurf übernehmen. Sie prüfen und bestätigen die Daten
          vor der Ausstellung. Ein Zahlungs-QR enthält nicht alle Angaben einer
          vollständigen Rechnung.
        </p>
        <p>
          Nach erfolgreicher Prüfung und Ausstellung senden Sie die Rechnung
          direkt aus ERechno per E-Mail. Empfänger, Betreff und Nachricht werden
          vorbereitet; die XRechnung wird automatisch angehängt. Sie müssen
          keinen eigenen E-Mail-Text schreiben: Vorschau prüfen und Versand
          bestätigen genügt.
        </p>
        <h2>Was zählt zum Monatslimit?</h2>
        <p>
          Erfolgreich ausgestellte Rechnungen zählen genau einmal, nach dem
          Kalendermonat in Deutschland. Laufende Ausstellungen reservieren einen
          Platz. Eine fehlgeschlagene Vorprüfung gibt ihn frei. Downloads und
          Entwürfe bleiben verfügbar, auch wenn das Limit erreicht ist.
        </p>
        <p>
          Eine spätere Stornierung erstattet keinen Rechnungsplatz. Neue
          ausgestellte Korrekturen würden separat zählen; Storno- und
          Gutschriftfunktionen sind derzeit nicht verfügbar.
        </p>
        <h2>Was kommt später?</h2>
        <p>
          ZUGFeRD, Rechnungs-PDF, Produktkatalog, DATEV, API und weitergehende
          Automatisierung sind noch nicht enthalten. Die endgültigen
          Zusatzfunktionen und steuerlichen Preisangaben werden vor dem
          Verkaufsstart veröffentlicht.
        </p>
        <Link href="/hilfe">Hilfe beim Start</Link>
      </section>
      <AutopilotPromotion />
    </Marketing>
  );
}
