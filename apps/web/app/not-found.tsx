import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="empty">
      <h1>Seite nicht gefunden.</h1>
      <Link href="/">Zur ERechno-Startseite</Link>
    </main>
  );
}
