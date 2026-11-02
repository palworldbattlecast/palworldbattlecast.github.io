const V = 'dorepacks-v9';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'cards.json', 'js/app.js', 'js/engine.js', 'js/audio.js', 'js/audiow.js', 'assets/index.json', 'assets/LilitaOne-Regular.b64', 'assets/PressStart2P-Regular.b64',  ...Array.from({ length: 10 }, (_, i) => `assets/b${i}.json`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url); if (u.origin !== location.origin) return;
  const put = res => { if (res.ok) { const cl = res.clone(); caches.open(V).then(c => c.put(e.request, cl)); } return res; };
  // big art/font bundles: cache-first. Code & pages: network-first so updates arrive, cache when offline.
  if (u.pathname.includes('/assets/')) e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(put)));
  else e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
