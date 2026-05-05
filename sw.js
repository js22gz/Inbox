const CACHE_NAME = 'inbox-v1';
const PRECACHE_URLS = ['index.html', 'manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('fetch', event => {
  // Cache-first strategy: serve from cache when available, otherwise fetch from network.
  // Falls back to a 503 response when both cache and network are unavailable.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
