import type { Metadata } from 'next';
import {
  APP_NAME,
  SEO_DEFAULT_TITLE,
  SEO_DEFAULT_DESCRIPTION,
} from '@flux/shared';
import { APP_URL } from '../lib/brand';
import '@fontsource-variable/inter';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: SEO_DEFAULT_TITLE, template: `%s | ${APP_NAME}` },
  description: SEO_DEFAULT_DESCRIPTION,
  icons: {
    icon: { url: '/favicon.png', type: 'image/png', sizes: '192x192' },
  },
  robots: { index: false, follow: false },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
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
