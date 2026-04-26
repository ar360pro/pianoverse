/* =====================================================
   PianoVerse Service Worker
   Offline caching | PWA support
   ===================================================== */

const CACHE_NAME = 'pianoverse-v2.4.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/play.html',
  '/songs.html',
  '/learn.html',
  '/themes.html',
  '/download.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail for assets that can't be cached
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for HTML/CSS/JS
        if (response && response.status === 200) {
          const url = new URL(event.request.url);
          if (['.html', '.css', '.js', '.json'].some(ext => url.pathname.endsWith(ext)) || url.pathname === '/') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Offline fallback for HTML pages
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Background sync for analytics
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

async function syncAnalytics() {
  // Mock sync — in production this would POST to your analytics endpoint
  console.log('[PianoVerse SW] Analytics synced');
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'PianoVerse', {
      body: data.body || 'You have a new notification',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: '🎹 Open App' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
  }
});
