import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { environment } from '../../packages/shared/src/index';
config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
environment();
const nextConfig: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: false },
  experimental: { serverActions: { bodySizeLimit: '512kb' } },
  serverExternalPackages: ['pg', 'pino', 'nodemailer'],
  async headers() {
    return [
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
