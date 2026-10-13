import Link from 'next/link';
export function AutopilotPromotion() {
  return (
    <section
      className="marketing-section autopilot-promotion"
      aria-label="ERechno Autopilot entdecken"
    >
      <p className="eyebrow">ERECHNO AUTOPILOT · IN ALLEN TARIFEN</p>
      <h2>Ihre Rechnungen brauchen Aufmerksamkeit. Ihre Zeit auch.</h2>
      <p>
        Sehen Sie an einem Ort, was heute wichtig ist: überfällige Rechnungen,
        offene Prüfungen, Zahlungsfristen und mögliche Duplikate. ERechno
        erklärt jeden Hinweis und führt Sie zur passenden nächsten Handlung.
      </p>
      <div className="marketing-grid">
        <article>
          <h3>Klar in den Tag starten</h3>
          <p>
            Der Morning Brief priorisiert Hinweise aus Ihren gespeicherten
            Rechnungen.
          </p>
        </article>
        <article>
          <h3>Fristen im Blick behalten</h3>
          <p>
            Zahlungsfristen und bestätigte Skontobedingungen werden sichtbar,
            bevor sie aus dem Blick geraten.
          </p>
        </article>
        <article>
          <h3>Mit Ihrer Entscheidung handeln</h3>
          <p>
            Zahlungen bewusst bestätigen, Originale vergleichen und erlaubte
            Checklisten vorbereiten lassen.
          </p>
        </article>
      </div>
      <div className="marketing-actions">
        <Link className="button button-primary" href="/funktionen/autopilot">
          Autopilot entdecken
        </Link>
        <Link className="button button-outline" href="/hilfe/autopilot">
          So funktioniert es
        </Link>
      </div>
      <p className="muted">
        Keine automatische Bankzahlung. Ausgestellte Rechnungen bleiben
        unverändert.
      </p>
    </section>
  );
}
