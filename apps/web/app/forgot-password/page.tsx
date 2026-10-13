import { APP_NAME } from '@flux/shared';
import Link from 'next/link';
import { AuthForm } from '../../components/auth-form';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
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
          <p>Ihr Geschäft verdient einen klaren Kopf.</p>
        </div>
        <small>Entwickelt für Unternehmen in Deutschland.</small>
      </div>
      <section className="auth-card">
        <p className="eyebrow">{APP_NAME} / KONTO</p>
        <h1>Neuer Zugang.</h1>
        <p className="muted">Fordern Sie einen sicheren Link an.</p>
        <AuthForm
          mode="forgot"
          {...(params.token ? { token: params.token } : {})}
        />
      </section>
    </main>
  );
}
