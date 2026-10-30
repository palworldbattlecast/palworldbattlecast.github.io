const V = 'dorepacks-v1';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'cards.json', 'js/app.js', 'js/engine.js', 'assets/index.json', 'assets/LilitaOne-Regular.b64', 'assets/PressStart2P-Regular.b64',  ...Array.from({ length: 7 }, (_, i) => `assets/b${i}.json`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok && new URL(e.request.url).origin === location.origin) { const cl = res.clone(); caches.open(V).then(c => c.put(e.request, cl)); } return res; })));
});
