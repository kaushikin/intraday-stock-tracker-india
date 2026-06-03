import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Intraday Stock Tracker India',
    short_name: 'Stock Tracker',
    description:
      'Track intraday trades, live prices, P/L, stop loss, targets and trade outcomes.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#10b981',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
