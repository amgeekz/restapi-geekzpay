/**
 * GeekzPay PWA - Service Worker
 * Untuk offline support dan background sync
 */

const CACHE_NAME = 'geekzpay-pwa-v1';
const ASSETS = [
    '/pwa/dashboard.html',
    '/pwa/dashboard.css',
    '/pwa/dashboard.js',
    '/pwa/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// ============================================
// INSTALL
// ============================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Caching assets...');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ============================================
// ACTIVATE
// ============================================
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

// ============================================
// FETCH
// ============================================
self.addEventListener('fetch', (event) => {
    // Skip API calls - biarkan online
    if (event.request.url.includes('/webhook/') || 
        event.request.url.includes('/qris/') ||
        event.request.url.includes('/diag')) {
        return event.respondWith(fetch(event.request));
    }

    // Cache strategy: stale-while-revalidate
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                const fetchPromise = fetch(event.request)
                    .then(response => {
                        // Cache response untuk next time
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        // Offline, return cached if available
                        if (cached) return cached;
                        // Fallback untuk HTML
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/pwa/dashboard.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
                
                return cached || fetchPromise;
            })
    );
});

// ============================================
// PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
    let data = {
        title: '⚡ GeekzPay',
        body: 'Pembayaran baru terdeteksi!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: true
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        }
    } catch {
        // Jika bukan JSON, gunakan text
        data.body = event.data?.text() || data.body;
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            vibrate: data.vibrate,
            requireInteraction: data.requireInteraction,
            data: data
        })
    );
});

// ============================================
// NOTIFICATION CLICK
// ============================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Cek jika sudah ada window terbuka
                for (const client of clientList) {
                    if (client.url.includes('/pwa/dashboard') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Buka baru
                return clients.openWindow('/pwa/dashboard.html');
            })
    );
});