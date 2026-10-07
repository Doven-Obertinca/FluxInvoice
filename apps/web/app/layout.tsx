import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'FluxInvoice', template: '%s · FluxInvoice' },
  description: 'Rechnungen klar und sicher verwalten.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
