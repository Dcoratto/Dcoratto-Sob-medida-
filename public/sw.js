const CACHE_VERSION = 'dcoratto-pwa-20260721-1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;

const APP_SHELL_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/logo.png',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icons/pwa-192x192.png',
  '/icons/pwa-512x512.png',
  '/icons/maskable-192x192.png',
  '/icons/maskable-512x512.png',
];

const SENSITIVE_PATH_PREFIXES = [
  '/api/',
  '/auth/',
  '/calendar/',
];

const STATIC_PATH_PREFIXES = [
  '/assets/',
  '/icons/',
];

const STATIC_DESTINATIONS = new Set([
  'font',
  'image',
  'manifest',
  'script',
  'style',
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await Promise.all(APP_SHELL_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset, {cache: 'reload'});
        if (response.ok) {
          await cache.put(asset, response);
        }
      } catch {
        // The app shell is best-effort; runtime fetch still owns real data.
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const expectedCaches = new Set([APP_SHELL_CACHE, STATIC_CACHE]);
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => (
      expectedCaches.has(cacheName) ? Promise.resolve() : caches.delete(cacheName)
    )));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const isSensitiveRequest = (url) => (
  SENSITIVE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
  url.pathname.includes('/storage/v1/') ||
  url.searchParams.has('token')
);

const isStaticAssetRequest = (request, url) => (
  STATIC_DESTINATIONS.has(request.destination) ||
  STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
  /^\/favicon(-\d+x\d+)?\.(ico|png)$/.test(url.pathname) ||
  url.pathname === '/apple-touch-icon.png' ||
  url.pathname === '/manifest.webmanifest' ||
  url.pathname === '/logo.png'
);

const isCacheableResponse = (response) => (
  response &&
  response.ok &&
  response.type !== 'opaque' &&
  !response.headers.get('set-cookie') &&
  !/application\/json/i.test(response.headers.get('content-type') || '')
);

const networkFirstNavigation = async (request) => {
  const shellCache = await caches.open(APP_SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response) && /text\/html/i.test(response.headers.get('content-type') || '')) {
      await shellCache.put('/', response.clone());
    }
    return response;
  } catch {
    return (await shellCache.match('/offline.html')) || (await shellCache.match('/')) || Response.error();
  }
};

const cacheFirstStaticAsset = async (request) => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    fetch(request)
      .then((response) => {
        if (isCacheableResponse(response)) {
          void cache.put(request, response);
        }
      })
      .catch(() => undefined);
    return cached;
  }

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});
