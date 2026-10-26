// Service worker mínimo de Amanti Barbiere.
// No guarda datos de citas ni páginas con sesión: todo va a la red.
// Solo muestra una página "Sin conexión" si al abrir la app no hay internet.
const CACHE = 'amanti-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // el resto lo maneja el navegador normal
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
