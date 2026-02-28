// ─── Cache version: bump this whenever you need to force cache invalidation ───
const CACHE_NAME = 'mealme-v3';

// Only pre-cache icon/manifest assets — NOT index.html
const PRECACHE_ASSETS = [
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install: pre-cache only static icon assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
    self.skipWaiting();
});

// Activate: delete ALL old caches, claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // ── 1. API / external requests → always network, no caching ──────────────
    if (url.hostname !== self.location.hostname || url.pathname.startsWith('/api')) {
        event.respondWith(fetch(request));
        return;
    }

    // ── 2. HTML navigation (index.html) → NETWORK-FIRST ──────────────────────
    // index.html has no content hash so it can change on every deploy.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // ── 3. Vite-hashed assets (/assets/*.js, /assets/*.css) → CACHE-FIRST ────
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // ── 4. Everything else → NETWORK-FIRST with cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});
