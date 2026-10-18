import type { MetadataRoute } from 'next'

// Lets "Add to Home Screen" / "Add to Dock" open Tax Tracks as a standalone app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tax Tracks',
    short_name: 'Tax Tracks',
    description: 'Your taxes. On track.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f1b20',
    theme_color: '#141a1f',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
