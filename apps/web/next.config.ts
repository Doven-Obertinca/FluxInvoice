import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { environment } from '../../packages/shared/src/index';
if (process.env.VERCEL !== '1')
  config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });
environment();
const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  outputFileTracingExcludes: {
    '*': ['../../.local/**/*', '../../.env*', './.env*'],
  },
  poweredByHeader: false,
  trailingSlash: false,
  async redirects() {
    return [
      ...[
        '/e-rechnung',
        '/e-rechnung-erstellen',
        '/e-rechnung-kostenlos',
        '/e-rechnung-software',
        '/kostenlos/e-rechnung-erstellen',
      ].map((source) => ({ source, destination: '/', permanent: true })),
      ...[
        '/xrechnung-erstellen',
        '/xrechnung-kostenlos',
        '/kostenlos/xrechnung-erstellen',
      ].map((source) => ({
        source,
        destination: '/xrechnung',
        permanent: true,
      })),
      {
        source: '/xrechnung-anzeigen',
        destination: '/kostenlos/xrechnung-anzeigen',
        permanent: true,
      },
    ];
  },
  logging: { incomingRequests: false },
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  serverExternalPackages: ['pg', 'pino', 'nodemailer'],
  async headers() {
    return [
      ...[
        'api',
        'dashboard',
        'invoices',
        'customers',
        'incoming',
        'settings',
        'billing',
        'autopilot',
        'onboarding',
        'sign-in',
        'sign-up',
        'forgot-password',
        'reset-password',
      ].map((path) => ({
        source: `/${path}/:path*`,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          ...(process.env.APP_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
};
export default nextConfig;
