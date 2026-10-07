import { WorkspaceTools } from '../../components/workspace-tools';
import Link from 'next/link';
import { Layers3 } from 'lucide-react';
import { Navigation } from '../../components/navigation';
import { principal, service } from '../../lib/server';
import { SignOut } from '../../components/auth-form';
export const dynamic = 'force-dynamic';
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await principal();
  const org = await service.company(p);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-symbol">
            <Layers3 size={23} />
          </span>
          FluxInvoice
        </Link>
        <div className="mobile-signout">
          <SignOut />
        </div>
        <div className="workspace">
          <span className="avatar">{org.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{org.name}</strong>
            <small>Arbeitsbereich · DE</small>
          </div>
        </div>
        <p className="nav-label">ARBEITSBEREICH</p>
        <Navigation />
        <div className="sidebar-bottom">
          <SignOut />
          <small>Rechnungen. Verlässlich.</small>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <WorkspaceTools />
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
