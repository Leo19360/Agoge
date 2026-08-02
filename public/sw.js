/* AGOGE Service Worker - PWA offline support */
const CACHE_NAME = 'agoge-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/css/style.css',
  '/manifest.json',
  '/js/db.js',
  '/js/api.js',
  '/js/theme.js',
  '/js/charts.js',
  '/js/app.js',
  '/js/pages/home.js',
  '/js/pages/sessions.js',
  '/js/pages/nutrition.js',
  '/js/pages/body.js',
  '/js/pages/profile.js'
];

// Install : cache les assets statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate : nettoie les vieux caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch : stratégie cache-first pour les assets, network-first pour les API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests : network-first avec fallback cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets : cache-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// Sync : synchronise les actions hors-ligne quand le réseau revient
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-agoge') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_NOW' });
    }
  } catch (e) {
    console.log('Sync error', e);
  }
}

