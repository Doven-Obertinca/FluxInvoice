'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h1>Das hat nicht funktioniert.</h1>
      <p>
        Die Daten konnten nicht geladen werden. Bitte prüfen Sie Ihren Zugriff
        oder versuchen Sie es erneut.
      </p>
      <button className="button button-primary" onClick={reset}>
        Erneut versuchen
      </button>
    </main>
  );
}
