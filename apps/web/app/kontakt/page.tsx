import type { Metadata } from 'next';
import { Marketing } from '../../components/marketing';
import { COMPANY_NAME, SUPPORT_EMAIL } from '../../lib/brand';
export const metadata: Metadata = {
  title: 'Kontakt',
  robots: { index: false, follow: true },
};
export default function Contact() {
  return (
    <Marketing>
      <section className="marketing-section prose">
        <h1>Kontakt zu ERechno</h1>
        {COMPANY_NAME && <p>{COMPANY_NAME}</p>}
        {SUPPORT_EMAIL ? (
          <p>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        ) : (
          <p>Die Support-Adresse wird vor dem öffentlichen Start hinterlegt.</p>
        )}
        <p>
          Bitte senden Sie keine Rechnungsdateien, Bankdaten oder
          Steuerkennzeichen per unverschlüsselter Support-Nachricht.
        </p>
      </section>
    </Marketing>
  );
}
