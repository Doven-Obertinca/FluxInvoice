import type { MetadataRoute } from 'next';
import { APP_NAME, APP_SHORT_NAME } from '@flux/shared';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    lang: 'de',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f7fb',
    theme_color: '#2563eb',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
