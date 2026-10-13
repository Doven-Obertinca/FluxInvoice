import { ImageResponse } from 'next/og';
import { APP_NAME, PLANS } from '@flux/shared';
export const alt =
  'ERechno – E-Rechnungen erstellen und mit Autopilot im Blick behalten';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: 80,
        background: '#f3f6fb',
        color: '#162338',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 36,
          color: '#2563eb',
          marginBottom: 45,
        }}
      >
        {APP_NAME}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        E-Rechnung kostenlos erstellen
      </div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 40 }}>
        {PLANS.FREE.monthlyInvoiceLimit} Rechnungen pro Monat kostenlos ·
        XRechnung mit Autopilot
      </div>
    </div>,
    size,
  );
}
