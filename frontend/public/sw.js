const CACHE = 'nexus-v1';
const STATIC = ['/', '/dashboard', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/') || e.request.url.includes('/ws')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(r => {
        if (r.ok && e.request.method === 'GET') caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      });
      return cached || net;
    })
  );
});
self.addEventListener('push', e => {
  const d = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(d.title || 'NEXUS Trade Alert', {
    body: d.body || 'Your bot executed a trade',
    icon: '/icon-192.png', badge: '/icon-192.png',
    tag: 'nexus-trade', data: { url: '/dashboard' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/dashboard'));
});
