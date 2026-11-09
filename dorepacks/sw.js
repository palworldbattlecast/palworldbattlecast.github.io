const V = 'dorepacks-v23';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'cards.json', 'js/app.js', 'js/engine.js', 'js/audio.js', 'js/audiow.js', 'assets/index.json', 'assets/LilitaOne-Regular.b64', 'assets/PressStart2P-Regular.b64',  ...Array.from({ length: 10 }, (_, i) => `assets/b${i}.json`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url); if (u.origin !== location.origin) return;
  const put = res => { if (res.ok) { const cl = res.clone(); caches.open(V).then(c => c.put(e.request, cl)); } return res; };
  // Art bundles: cache-first inside the versioned cache (old caches wiped on activate).
  if (u.pathname.includes('/assets/') && /\/b\d+\.json$/.test(u.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(put)));
  } else {
    // Code, cards.json, HTML: network-first with no-cache so HT + balance updates reach installed PWAs.
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(put).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
