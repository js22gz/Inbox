const CACHE_NAME = 'inbox-v2';
const PRECACHE_URLS = ['index.html', 'manifest.json', 'favicon.ico', 'i_bracket_logo192.png', 'i_bracket_logo512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // For navigation requests (page loads/reloads), prefer network and fall back to
  // cached index.html so the app opens offline without a blank screen.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('index.html').then(r => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Cache-first strategy: serve from cache when available, otherwise fetch from network.
  // Falls back to a 503 response when both cache and network are unavailable.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
