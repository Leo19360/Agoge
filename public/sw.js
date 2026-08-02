/* AGOGE Service Worker - PWA offline support */
const CACHE_NAME = 'agoge-v7';
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

function cacheResponse(request, response) {
  return caches.open(CACHE_NAME).then((cache) => {
    cache.put(request, response.clone());
    return response;
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => cacheResponse(request, response))
    .catch(() => caches.match(request));
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => cacheResponse(request, response));
  });
}

// Fetch : stratégie network-first pour le frontend, avec fallback cache pour les API et assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApi = url.pathname.startsWith('/api/');
  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';
  const isFrontendAsset = ['script', 'style', 'manifest', 'image'].includes(event.request.destination)
    || ['/index.html', '/logo.png', '/manifest.json'].includes(url.pathname);

  if (isApi) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isDocument || isFrontendAsset) {
    event.respondWith(networkFirst(event.request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(cacheFirst(event.request));
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

