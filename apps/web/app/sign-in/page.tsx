import { selectedPlan } from '../../lib/plan-choice';
import { PLANS } from '@flux/shared';
import { APP_NAME } from '@flux/shared';
import Link from 'next/link';
import { AuthForm } from '../../components/auth-form';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const plan = await selectedPlan();
  return (
    <main className="auth-layout">
      <div className="auth-art">
        <Link className="brand" href="/">
          ▧ {APP_NAME}
        </Link>
        <div>
          <p className="eyebrow">WENIGER AUFWAND. MEHR ÜBERBLICK.</p>
          <h1>
            Gute Arbeit.
            <br />
            Klare Rechnungen.
          </h1>
          <p>
            Ihr Geschäft verdient einen klaren Kopf. Mit Autopilot sehen Sie
            offene Aufgaben und Zahlungsfristen an einem Ort.
          </p>
          <Link href="/hilfe/autopilot">Autopilot verwenden →</Link>
        </div>
        <small>Entwickelt für Unternehmen in Deutschland.</small>
      </div>
      <section className="auth-card">
        <p className="eyebrow">{APP_NAME} / KONTO</p>
        <h1>Willkommen zurück.</h1>
        <p className="muted">Ein klarer Blick auf Ihre Rechnungen.</p>
        {plan && (
          <p className="notice">
            Gewählter Tarif: {PLANS[plan].name}
            {plan !== 'FREE'
              ? ' · Zahlung nach der Einrichtung'
              : ' · kostenlos'}
          </p>
        )}
        <AuthForm
          afterSignIn={plan && plan !== 'FREE' ? '/billing' : '/dashboard'}
          mode="sign-in"
          {...(params.token ? { token: params.token } : {})}
        />
      </section>
    </main>
  );
}
