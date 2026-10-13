import 'server-only';
import {
  APP_NAME,
  SEO_DEFAULT_DESCRIPTION,
  validateProduction,
} from '@flux/shared';
import type { Metadata } from 'next';
validateProduction(process.env);
const origin =
  process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const url = new URL(origin);
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== '/'
)
  throw new Error(
    'APP_URL must be a public origin without a path, credentials, query or fragment',
  );
export const APP_URL = url.origin;
export const COMPANY_NAME = process.env.COMPANY_NAME ?? '';
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? '';
export const publicIndexable =
  process.env.APP_ENV === 'production' &&
  !!process.env.APP_URL &&
  url.protocol === 'https:';
export const publicRoutes = [
  '/',
  '/preise',
  '/xrechnung',
  '/e-rechnung-empfangen',
  '/kostenlos/xrechnung-anzeigen',
  '/ratgeber/xrechnung-oder-zugferd',
  '/sicherheit',
  '/hilfe',
  '/ueber',
  '/funktionen/autopilot',
  '/hilfe/autopilot',
];
export function publicMetadata(
  title: string,
  description: string,
  path: string,
  keywords: string[] = [],
): Metadata {
  return {
    title,
    description,
    ...(keywords.length ? { keywords } : {}),
    alternates: { canonical: APP_URL + (path === '/' ? '' : path) },
    robots: { index: publicIndexable, follow: true },
    openGraph: {
      title,
      description,
      url: APP_URL + path,
      siteName: APP_NAME,
      locale: 'de_DE',
      type: 'website',
      images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image'],
    },
  };
}
export const defaultDescription = SEO_DEFAULT_DESCRIPTION;
