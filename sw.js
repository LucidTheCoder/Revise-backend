// Revise. Service Worker — offline-first for topic JSON and static assets
const CACHE_VERSION  = 'revise-v1';
const STATIC_ASSETS  = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/editor-styles.css',
  '/data/subjects.json',
  '/data/past-papers.json',
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
// - Topic JSON files: cache-first (they rarely change)
// - API calls: network-first with cache fallback
// - Everything else: stale-while-revalidate
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept non-GET or cross-origin API calls
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) {
    // Network-first for API
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for topic JSON
  if (url.pathname.startsWith('/data/topics/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
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
