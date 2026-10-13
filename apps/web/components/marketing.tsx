import Link from 'next/link';
import { APP_NAME } from '@flux/shared';
import { APP_URL, SUPPORT_EMAIL } from '../lib/brand';
export function StructuredData({ value }: { value: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replace(/</g, '\u003c'),
      }}
    />
  );
}
export function Marketing({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      <header className="marketing-header">
        <Link className="brand" href="/">
          {APP_NAME}
          <span className="brand-dot">●</span>
        </Link>
        <nav aria-label="Öffentliche Navigation">
          <Link href="/xrechnung">XRechnung</Link>
          <Link href="/funktionen/autopilot">Autopilot</Link>
          <Link href="/preise">Preise</Link>
          <Link href="/hilfe">Hilfe</Link>
        </nav>
        <Link className="button button-outline" href="/sign-in">
          Anmelden
        </Link>
      </header>
      <aside
        className="autopilot-announcement"
        aria-label="Autopilot entdecken"
      >
        <Link href="/funktionen/autopilot">
          <strong>ERechno Autopilot</strong> · Rechnungen, Fristen und nächste
          Schritte im Blick →
        </Link>
      </aside>
      <main id="main">{children}</main>
      <footer className="marketing-footer">
        <p>
          <strong>{APP_NAME}</strong> · E-Rechnungen einfach gemacht.
        </p>
        <nav aria-label="Weitere Informationen">
          <Link href="/ueber">Über ERechno</Link>
          <Link href="/funktionen/autopilot">ERechno Autopilot</Link>
          <Link href="/hilfe/autopilot">Autopilot-Anleitung</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/sicherheit">Sicherheit</Link>
          <Link href="/hilfe">Hilfe</Link>
          <Link href="/ratgeber/xrechnung-oder-zugferd">
            XRechnung oder ZUGFeRD?
          </Link>
          {SUPPORT_EMAIL && <a href={`mailto:${SUPPORT_EMAIL}`}>Kontakt</a>}
        </nav>
      </footer>
    </div>
  );
}
export function Breadcrumb({ title, path }: { title: string; path: string }) {
  return (
    <>
      <nav className="breadcrumbs" aria-label="Brotkrumennavigation">
        <Link href="/">Start</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{title}</span>
      </nav>
      <StructuredData
        value={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Start', item: APP_URL },
            {
              '@type': 'ListItem',
              position: 2,
              name: title,
              item: APP_URL + path,
            },
          ],
        }}
      />
    </>
  );
}
export function StartLink() {
  return (
    <Link className="button button-primary" href="/sign-up">
      Kostenlos starten
    </Link>
  );
}
