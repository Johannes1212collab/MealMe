// ─── NUCLEAR CACHE BUSTER (v4) ───────────────────────────────────────────────
// This SW's only job is to:
//   1. Delete every cache that exists
//   2. Unregister itself so the next load has NO service worker
//   3. Navigate all open clients to get genuinely fresh HTML + JS from the network
//
// Once the fresh code lands, main.jsx will NOT re-register a new SW,
// so users stay cache-free until we deliberately add a new one.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
    // Take control immediately — don't wait for old SW to finish
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            // 1. Wipe every cache
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            // 2. Unregister this SW — next load will have no SW at all
            .then(() => self.registration.unregister())
            // 3. Force every open tab/window to reload via the network
            .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
            .then((clients) => Promise.all(clients.map((c) => c.navigate(c.url))))
    );
});

// While this transitional SW is briefly active, always go to the network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.hostname === self.location.hostname) {
        event.respondWith(fetch(event.request));
    }
});
