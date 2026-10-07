export default function Loading() {
  return (
    <div
      className="loading-state"
      role="status"
      aria-label="Inhalt wird geladen"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-summary" />
      <div className="skeleton skeleton-table" />
      <span className="sr-only">Inhalt wird geladen …</span>
    </div>
  );
}
