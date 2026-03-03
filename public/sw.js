// ─── MealMe Service Worker ────────────────────────────────────────────────────
// Handles push notifications and basic network-first caching.

const CACHE_NAME = 'mealme-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Network-first fetch (fall back to cache for GET requests)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

    const title = data.title || 'MealMe';
    const options = {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag || 'mealme-push',
        renotify: true,
        data: data.data || {},
        actions: data.actions || [],
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // action = '2' | '3' | '4' | '5' | '6plus' | '' (body tap)
    const action = event.action;
    let url = '/';

    if (action && action !== '') {
        // User tapped a quick-pick action button → go straight to app with count
        url = `/?mealPlan=${action}`;
    } else {
        // User tapped the notification body → open app and show the modal
        url = '/?showMealPrompt=1';
    }

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Focus existing tab if open
            for (const client of clients) {
                if (new URL(client.url).origin === self.location.origin) {
                    client.focus();
                    client.navigate(url);
                    return;
                }
            }
            // Otherwise open a new tab
            return self.clients.openWindow(url);
        })
    );
});
