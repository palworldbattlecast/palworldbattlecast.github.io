// Doreventure service worker: build parts are versioned, so cache them forever; the page itself is network-first.
const C='doreventure-v11021015';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 if(u.pathname.endsWith('.b64'))e.respondWith(caches.open(C).then(c=>c.match(e.request).then(h=>h||fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}))));
 else e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));});
