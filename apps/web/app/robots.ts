import type { MetadataRoute } from 'next';
import { APP_URL, publicIndexable } from '../lib/brand';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: publicIndexable
        ? [
            '/api/',
            '/dashboard',
            '/invoices',
            '/customers',
            '/incoming',
            '/settings',
            '/billing',
            '/autopilot',
            '/onboarding',
          ]
        : '/',
    },
    ...(publicIndexable ? { sitemap: `${APP_URL}/sitemap.xml` } : {}),
  };
}
