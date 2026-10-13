import Link from 'next/link';
import {
  Marketing,
  Breadcrumb,
  StartLink,
} from '../../../components/marketing';
import { publicMetadata } from '../../../lib/brand';
export const metadata = publicMetadata(
  'Autopilot verwenden: Anleitung für Rechnungen und Fristen',
  'So nutzen Sie den Morning Brief, bestätigen Zahlungen, vergleichen Duplikate, erfassen Skonto und stellen ERechno Autopilot sicher ein.',
  '/hilfe/autopilot',
  [
    'ERechno Autopilot Anleitung',
    'Morning Brief',
    'Zahlung bestätigen',
    'Skonto erfassen',
    'Eingangsrechnung Duplikat prüfen',
  ],
);
export default function Page() {
  return (
    <Marketing>
      <article className="marketing-section prose">
        <Breadcrumb title="Autopilot verwenden" path="/hilfe/autopilot" />
        <h1>ERechno Autopilot: Schritt für Schritt</h1>
        <p>
          Autopilot arbeitet mit den Rechnungen Ihres Unternehmens. Sie brauchen
          keine Eingabeaufforderung und keinen Chat: Die Hinweise entstehen aus
          gespeicherten Daten und bekannten Fristen.
        </p>
        <nav className="autopilot-help-index" aria-label="In dieser Anleitung">
          {[
            ['start', 'Morning Brief öffnen'],
            ['hinweise', 'Hinweise verstehen'],
            ['zahlungen', 'Zahlungen bestätigen'],
            ['duplikate', 'Duplikate vergleichen'],
            ['skonto', 'Skontobedingungen erfassen'],
            ['prognose', 'Geldbewegungen verstehen'],
            ['einstellungen', 'Arbeitsweise einstellen'],
            ['verlauf', 'Verlauf und Tagesbericht'],
          ].map(([id, label]) => (
            <Link key={id} href={`#${id}`}>
              {label}
            </Link>
          ))}
        </nav>
        <h2 id="start">1. Ihren Morning Brief öffnen</h2>
        <ol>
          <li>Melden Sie sich an und richten Sie Ihre Firmendaten ein.</li>
          <li>
            Erstellen Sie Rechnungen oder importieren Sie Eingangsrechnungen in
            den Arbeitsbereich.
          </li>
          <li>
            Öffnen Sie „Übersicht“ oder „Autopilot“ in der Hauptnavigation.
          </li>
          <li>
            Wählen Sie einen Hinweis. Die hinterlegte Rechnung und die Erklärung
            zeigen Ihnen, warum er erscheint.
          </li>
        </ol>
        <p>
          Der Hintergrunddienst aktualisiert die Hinweise nach Änderungen und
          regelmäßig im laufenden Betrieb. Bei vielen vorhandenen Dokumenten
          kann die erste Aufbereitung etwas dauern. Die Geldübersicht zeigt
          ihren Datenstand.
        </p>
        <h2 id="hinweise">2. Hinweise verstehen und bearbeiten</h2>
        <p>
          „Dringend“ und „Prüfen“ stehen vor weniger dringenden Hinweisen. Unter
          „Warum sehe ich diesen Hinweis?“ finden Sie Regel, bekannte Fakten und
          Erkennungszeitpunkt.
        </p>
        <ul>
          <li>
            <strong>Quelle prüfen:</strong> Öffnet die Rechnung oder den
            zugehörigen Arbeitsbereich. Prüfprobleme bearbeiten Sie im
            vorhandenen Prüfprozess; einen erneuten Versand bestätigen Sie in
            der Versandvorschau.
          </li>
          <li>
            <strong>Zur Kenntnis genommen:</strong> Markiert den Hinweis als
            gesehen. Die zugrunde liegende Rechnung bleibt unverändert.
          </li>
          <li>
            <strong>Morgen erinnern:</strong> Verschiebt einen geeigneten
            Hinweis auf den nächsten Kalendertag.
          </li>
          <li>
            <strong>Hinweis verwerfen:</strong> Entfernt eine geeignete
            Empfehlung aus der offenen Liste. Neue relevante Quelldaten können
            sie erneut öffnen.
          </li>
          <li>
            <strong>Hilfreich, nicht relevant oder für mich ausblenden:</strong>{' '}
            Gibt Rückmeldung beziehungsweise verändert Ihre persönliche Ansicht.
          </li>
        </ul>
        <p>
          Erforderliche Prüfungen können nicht verworfen, verschoben oder
          persönlich ausgeblendet werden. Sie verschwinden erst, wenn sich ihr
          sachlicher Grund erledigt hat. Welche Handlungen Sie ausführen dürfen,
          hängt von Ihrer Rolle im Unternehmen ab.
        </p>
        <h2 id="zahlungen">3. Eine vollständige Zahlung bestätigen</h2>
        <ol>
          <li>
            Öffnen Sie einen Hinweis zu einer überfälligen oder bald fälligen
            Rechnung.
          </li>
          <li>
            Gleichen Sie die Zahlung mit Ihrem Konto oder Ihrem Zahlungsnachweis
            ab.
          </li>
          <li>
            Tragen Sie unter „Bereits bezahlt?“ den tatsächlichen Zahlungstag
            ein.
          </li>
          <li>Wählen Sie „Bestätigung vorbereiten“.</li>
          <li>
            Prüfen Sie Betrag und Datum und wählen Sie „Vollständige Zahlung
            bestätigen“.
          </li>
        </ol>
        <p>
          Die Bestätigung gilt fünf Minuten und wird auf dem Server geprüft.
          Geänderte Quelldaten erfordern eine neue Vorbereitung. Erfasst wird
          eine von Ihnen bestätigte vollständige Zahlung, keine Banküberweisung.
          Teilzahlungen und automatischer Bankabgleich sind nicht enthalten.
          Eine Korrekturoberfläche für bereits bestätigte Zahlungsangaben ist
          derzeit noch nicht vorhanden: Kontrollieren Sie die Angaben
          sorgfältig.
        </p>
        <h2 id="duplikate">4. Mögliche doppelte Rechnungen vergleichen</h2>
        <p>
          Öffnen Sie den Duplikathinweis. Vergleichen Sie Dokument A und
          Dokument B, ihre Rechnungsnummern, Lieferanten, Beträge und
          Originaldateien. Ein identischer Datei-Hash weist auf gleiche
          Originaldateien hin; andere Übereinstimmungen sind zunächst ein
          Verdacht.
        </p>
        <ol>
          <li>
            Öffnen Sie bei Bedarf beide Originale mit ihren Prüfergebnissen.
          </li>
          <li>
            Bereiten Sie die Entscheidung „Duplikat“ oder „Eigenständige
            Rechnungen“ vor.
          </li>
          <li>
            Lesen Sie die Bestätigung: Bei einer Duplikatzuordnung wird Dokument
            A aus dem erwarteten Ausgabenüberblick ausgeschlossen.
          </li>
          <li>
            Bestätigen Sie nur, wenn die Zuordnung zum Geschäftsvorgang stimmt.
          </li>
        </ol>
        <p>
          Beide Originaldateien bleiben erhalten. Die Entscheidung ist keine
          automatische Freigabe und ändert keine Rechnungsbeträge. Eine
          Korrekturoberfläche für bestätigte Duplikatentscheidungen ist derzeit
          noch nicht enthalten.
        </p>
        <h2 id="skonto">5. Zahlungs- und Skontobedingungen erfassen</h2>
        <ol>
          <li>Öffnen Sie eine Eingangsrechnung.</li>
          <li>
            Vergleichen Sie den Bereich „Bestätigte Zahlungsbedingungen“ mit dem
            Original.
          </li>
          <li>
            Erfassen Sie Zahlungsfrist und gegebenenfalls Skontofrist,
            Prozentsatz und Skontobasis in EUR. Skonto benötigt alle drei
            Angaben.
          </li>
          <li>Wählen Sie „Bedingungen bestätigen“.</li>
        </ol>
        <p>
          Für freigegebene, offene Eingangsrechnungen erscheinen bekannte
          Zahlungsfristen innerhalb von sieben Tagen und bestätigte
          Skontofristen innerhalb von drei Tagen. Die Fristen gelten nach
          Kalendertagen in Europe/Berlin. ERechno entscheidet nicht, ob ein
          Skonto rechtlich oder steuerlich zulässig ist.
        </p>
        <h2 id="prognose">6. Die Übersicht der Geldbewegungen lesen</h2>
        <p>
          Erwartete Einnahmen und bekannte Ausgaben werden anhand der
          gespeicherten Rechnungen und ihrer Fristen für sieben und 30 Tage
          zusammengefasst. Freigegebene Eingangsrechnungen zählen als bekannte
          Ausgaben; bestätigte Zahlungen und bestätigte Duplikate werden
          entsprechend berücksichtigt.
        </p>
        <p>
          Die Differenz ist eine erwartete Geldbewegung, kein Kontostand. Es
          gibt keine Bankanbindung und keine Zusage, dass Kunden pünktlich
          zahlen. Das Zahlungsverhalten Ihrer Kunden basiert nur auf tatsächlich
          von Ihnen bestätigten Zahlungstagen; ohne diese Angaben gibt es keine
          belastbare Auswertung.
        </p>
        <h2 id="einstellungen">7. Ihre Arbeitsweise einstellen</h2>
        <ol>
          <li>Öffnen Sie „Autopilot“ und „Einstellungen“.</li>
          <li>Wählen Sie „Manuell“, „Assistiert“ oder „Autopilot“.</li>
          <li>
            Aktivieren Sie bei Autopilot ausdrücklich die gewünschten internen
            Checklisten für Eingangsprüfung, Versandprobleme oder
            Zahlungsfristen.
          </li>
          <li>
            Speichern Sie die Einstellungen. Dafür benötigen Sie die Rolle Owner
            oder Admin.
          </li>
        </ol>
        <p>
          Manuell erkennt und empfiehlt. Assistiert bietet Checklisten auf
          Wunsch. Autopilot bereitet nur ausgewählte Checklisten automatisch
          vor. „In Arbeit“ bedeutet Vorbereitung; eine Freigabe, ein erneuter
          Versand oder eine Zahlung ist damit noch nicht erledigt. Automatische
          Bankzahlungen, Steuerentscheidungen und automatische
          Erinnerungs-E-Mails sind nicht enthalten.
        </p>
        <h2 id="verlauf">8. Entscheidungen und Tagesbericht wiederfinden</h2>
        <p>
          Unter „Aktivitäten“ sehen Sie die letzten Änderungen. „Vollständigen
          Verlauf ansehen“ öffnet die gespeicherten Entscheidungen und
          Faktenstände; über „Ältere Aktivitäten“ gehen Sie weiter zurück. Der
          Tagesbericht fasst Hinweise intern zusammen und wird nicht automatisch
          per E-Mail versendet.
        </p>
        <h2>Es fehlen Hinweise?</h2>
        <p>
          Prüfen Sie, ob Sie im richtigen Unternehmen angemeldet sind, ob
          Rechnungen bereits ausgestellt beziehungsweise Eingangsrechnungen
          freigegeben sind und ob eine Zahlungsfrist bekannt ist. Auch eine
          bestätigte Zahlung, ein verschobener Hinweis oder Ihre persönliche
          Ausblendung kann erklären, warum ein Hinweis nicht in der offenen
          Liste erscheint.
        </p>
        <div className="marketing-actions">
          <Link className="button button-primary" href="/autopilot">
            Autopilot öffnen
          </Link>
          <Link href="/funktionen/autopilot">Funktionsübersicht ansehen →</Link>
          <StartLink />
        </div>
      </article>
    </Marketing>
  );
}
