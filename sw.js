// Revise. Service Worker — freshness-first to avoid stale topic/app content.
const CACHE_VERSION  = 'revise-v2026-03-28-2';
const STATIC_ASSETS  = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/editor-styles.css',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - App shell + JSON + API: network-first (prevents stale topic lists/content)
// - Everything else: stale-while-revalidate
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept non-GET requests.
  if (request.method !== 'GET') return;

  const isSameOrigin = url.origin === self.location.origin;
  const path = url.pathname;
  const isCriticalAsset =
    path === '/' ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.startsWith('/data/') ||
    path.startsWith('/api/');

  if (isSameOrigin && isCriticalAsset) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok && !path.startsWith('/api/')) {
            caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached   = await cache.match(request);
      const fetchProm = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      return cached || fetchProm;
    })
  );
});
