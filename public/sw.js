const CACHE='cotego-shell-20261111-preview-02';
const SHELL=['/','/manifest.webmanifest','/favicon.svg','/cotego-rework.css','/live-scores.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async()=>{for(const name of await caches.keys()) if(name !== CACHE) await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET' || new URL(request.url).origin!==self.location.origin)return;
  if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/')));
  else event.respondWith(caches.match(request).then(response=>response||fetch(request)));
});
