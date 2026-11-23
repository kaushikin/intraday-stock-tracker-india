const CACHE_NAME = 'intraday-stock-tracker-v1';

const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => undefined);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache live API/market data
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname === '/icon-192.png' ||
    url.pathname === '/icon-512.png' ||
    url.pathname === '/apple-touch-icon.png'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        });
      }),
    );
  }
});

// Server push wakes this worker even when no app tab is open. No market polling,
// order actions or journal writes run in the worker.
self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || !['TEST', 'CANDIDATE'].includes(payload.kind)) return;
  const expired =
    !Number.isFinite(payload.expiresAt) || Date.now() > payload.expiresAt;
  event.waitUntil(
    self.registration.showNotification(
      expired
        ? 'Gold Petal · earlier alert expired'
        : String(payload.title).slice(0, 100),
      {
        body: expired
          ? 'This notification arrived too late. Open the app for a fresh check; do not use the earlier prices.'
          : String(payload.body).slice(0, 500),
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'gold-petal-' + String(payload.tag || 'test').slice(0, 150),
        data: { goldPetal: true },
      },
    ),
  );
});
self.addEventListener('notificationclick', (event) => {
  if (!event.notification.data?.goldPetal) return;
  event.notification.close();
  const destination = self.location.origin + '/commodities/gold-petal';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        const tab = clients.find((client) => client.url === destination);
        if (tab) return tab.focus();
        return self.clients.openWindow(destination);
      }),
  );
});
