// Bump the version whenever the offline shell must be purged — old cache
// entries otherwise keep serving a stale layout (activate deletes the rest).
const CACHE_NAME = 'foodsafe-v4';
const LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  if (LOCALHOST) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('foodsafe-') && (LOCALHOST || name !== CACHE_NAME))
          .map((name) => caches.delete(name))
      );
    }).then(async () => {
      await self.clients.claim();
      if (LOCALHOST) await self.registration.unregister();
    })
  );
});

// Strategy: never cache APIs or cross-origin (Supabase) traffic; pages are
// network-first so a deploy shows up immediately (cache only as the offline
// fallback); hashed /_next/static assets are cache-first since their URLs
// change on every build.
self.addEventListener('fetch', (event) => {
  if (LOCALHOST) return;
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isImmutable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json';

  if (isImmutable) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
