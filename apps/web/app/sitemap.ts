import type { MetadataRoute } from 'next';
import { APP_URL, publicIndexable, publicRoutes } from '../lib/brand';
export default function sitemap(): MetadataRoute.Sitemap {
  return publicIndexable
    ? publicRoutes.map((path) => ({
        url: APP_URL + (path === '/' ? '' : path),
      }))
    : [];
}
