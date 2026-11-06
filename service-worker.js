const CACHE = 'zahra-v1';
const FILES = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/offline.html', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(ca => ca.put(req, copy)); return r;
  })));
});
