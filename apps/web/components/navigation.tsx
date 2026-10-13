'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FileText, Settings } from 'lucide-react';
const routes = [
  { Icon: LayoutDashboard, label: 'Übersicht', href: '/dashboard' },
  { Icon: LayoutDashboard, label: 'Autopilot', href: '/autopilot' },
  { Icon: FileText, label: 'Rechnungen', href: '/invoices' },
  { Icon: Users, label: 'Kunden', href: '/customers' },
  { Icon: FileText, label: 'Tarif & Nutzung', href: '/billing' },
  { Icon: Settings, label: 'Einstellungen', href: '/settings/company' },
];
export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation">
      {routes.map(({ Icon, label, href }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            pathname.startsWith(href.split('/').slice(0, 2).join('/'))
              ? 'page'
              : undefined
          }
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
