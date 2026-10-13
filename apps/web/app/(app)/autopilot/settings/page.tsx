import Link from 'next/link';
import { autopilot, principal } from '../../../../lib/server';
import { saveAutopilotPolicy } from '../../../../lib/autopilot-actions';
export default async function Settings() {
  const { policy } = await autopilot.brief(await principal());
  return (
    <section className="panel">
      <p className="eyebrow">AUTOPILOT</p>
      <h1>Sie bestimmen, was ERechno vorbereitet</h1>
      <p>
        <Link href="/hilfe/autopilot#einstellungen">
          Arbeitsweisen und Einstellungen erklärt →
        </Link>
      </p>
      <form action={saveAutopilotPolicy}>
        <label>
          Arbeitsweise
          <select name="mode" defaultValue={policy?.mode ?? 'MANUAL'}>
            <option value="MANUAL">Manuell · Hinweise erkennen</option>
            <option value="ASSISTED">
              Assistiert · Checklisten auf Wunsch vorbereiten
            </option>
            <option value="AUTOPILOT">
              Autopilot · ausgewählte Checklisten automatisch vorbereiten
            </option>
          </select>
        </label>
        <p>
          Automatische Vorbereitung erstellt eine interne Checkliste.
          Bankzahlungen, Steuerentscheidungen, Freigaben und Nachrichten
          benötigen weiterhin Ihre eigene Entscheidung.
        </p>
        <fieldset>
          <legend>Automatische Checklisten</legend>
          {[
            ['INVOICE_REQUIRES_REVIEW', 'Eingangsrechnung prüfen'],
            ['DELIVERY_FAILED', 'Versandfehler prüfen'],
            ['PAYMENT_DUE_SOON', 'Zahlungsfrist prüfen'],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                name="rules"
                value={value}
                defaultChecked={policy?.prepareRules.includes(value!)}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>
        <p className="muted">Fristen gelten in Europe/Berlin.</p>
        <button className="button button-primary">
          Einstellungen speichern
        </button>
      </form>
    </section>
  );
}
