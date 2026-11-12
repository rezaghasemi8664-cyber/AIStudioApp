/* Roniya PWA service worker.
 * Deliberately does not cache application/API responses to avoid stale
 * market data, authentication state, or app bundles.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Keep requests network-driven; no offline or API caching is performed.
self.addEventListener('fetch', () => {});
