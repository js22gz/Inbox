const CACHE_NAME = 'inbox-v10';
const PRECACHE_URLS = ['index.html', 'manifest.json', 'favicon.ico', 'i_bracket_logo192.png', 'i_bracket_logo512.png'];

// v10 - active polling every 4s while visible for near-instant cross-device sync (create/check/edit now propagate quickly when both devices are open)

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

function isIndexRequest(request) {
  if (request.mode === 'navigate') return true;
  try {
    const path = new URL(request.url).pathname;
    return path === '/' || path.endsWith('/index.html');
  } catch {
    return false;
  }
}

function networkFirstIndex(request) {
  return fetch(request)
    .then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match('index.html').then(r => r || new Response('Offline', { status: 503 })));
}

self.addEventListener('fetch', event => {
  // Always try network for the app shell so UI updates reach installed PWAs.
  if (isIndexRequest(event.request)) {
    event.respondWith(networkFirstIndex(event.request));
    return;
  }

  // Cache-first for static assets; fall back to network, then offline.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
