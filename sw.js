const CACHE_NAME = 'f7-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
