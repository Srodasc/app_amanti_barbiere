import type { MetadataRoute } from 'next';

// App instalable (PWA): el barbero la agrega a la pantalla de inicio y abre directo en "Mi día".
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/mi-dia',
    name: 'Amanti Barbiere',
    short_name: 'Amanti',
    description: 'Mi día: citas, cobros y ventas del barbero.',
    start_url: '/mi-dia',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fcf9f8',
    theme_color: '#775a19',
    lang: 'es-CO',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
