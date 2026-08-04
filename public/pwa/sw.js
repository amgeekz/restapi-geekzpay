/**
 * GeekzPay PWA - Service Worker
 */

const CACHE_NAME = 'geekzpay-pwa-v1';
const ASSETS = [
    '/pwa/dashboard.html',
    '/pwa/dashboard.css',
    '/pwa/dashboard.js',
    '/pwa/manifest.json',
    '/icon48.png',
    '/icon128.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/webhook/') || 
        event.request.url.includes('/qris/') ||
        event.request.url.includes('/diag')) {
        return event.respondWith(fetch(event.request));
    }

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                const fetchPromise = fetch(event.request)
                    .then(response => {
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        if (cached) return cached;
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/pwa/dashboard.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
                
                return cached || fetchPromise;
            })
    );
});

self.addEventListener('push', (event) => {
    let data = {
        title: '◆ Pembayaran Masuk',
        body: 'Ada transaksi baru',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200, 100, 300],
        requireInteraction: true,
        tag: 'payment-notification'
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        }
    } catch {
        data.body = event.data?.text() || data.body;
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            vibrate: data.vibrate,
            requireInteraction: data.requireInteraction,
            tag: data.tag,
            data: data
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url.includes('/pwa/dashboard') && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow('/pwa/dashboard.html');
            })
    );
});