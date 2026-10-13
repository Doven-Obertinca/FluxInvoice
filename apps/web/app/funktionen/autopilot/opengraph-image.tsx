import { ImageResponse } from 'next/og';
export const alt =
  'ERechno Autopilot – Rechnungen, Fristen und nächste Schritte im Blick';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '64px 72px',
        background: '#eff5f7',
        color: '#1b2536',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, color: '#174e64' }}>
        ERechno Autopilot
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 67,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        Wissen, welche Rechnung heute wichtig ist.
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        {[
          'Fristen erkennen',
          'Originale vergleichen',
          'Bewusst bestätigen',
        ].map((label) => (
          <div
            key={label}
            style={{
              display: 'flex',
              background: '#fff',
              border: '1px solid #d5e2e7',
              borderRadius: 16,
              padding: '20px',
              fontSize: 23,
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 24, color: '#174e64' }}>
        In allen Tarifen enthalten · Kostenlos starten
      </div>
    </div>,
    size,
  );
}
