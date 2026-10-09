import Link from 'next/link';
export function InvoiceDirections({
  current,
}: {
  current: 'incoming' | 'outgoing' | 'problems';
}) {
  return (
    <nav className="direction-tabs" aria-label="E-Rechnungen">
      <Link
        aria-current={current === 'incoming' ? 'page' : undefined}
        href="/incoming"
      >
        Eingang
      </Link>
      <Link
        aria-current={current === 'outgoing' ? 'page' : undefined}
        href="/invoices"
      >
        Ausgang
      </Link>
      <Link
        aria-current={current === 'problems' ? 'page' : undefined}
        href="/incoming?problems=1"
      >
        Probleme im Eingang
      </Link>
      <Link href="/invoices/attention">Probleme im Ausgang</Link>
    </nav>
  );
}
