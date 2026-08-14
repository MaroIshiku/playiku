const CACHE = 'playiku-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/playiku-icon.png'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then(async (cache) => {
  for (const path of SHELL) {
    const response = await fetch(new Request(path, { cache: 'reload' }));
    if (!response.ok) throw new Error(`Could not cache ${path}.`);
    await cache.put(path, response);
  }
}).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/health/')) return;
  const request = event.request.mode === 'navigate' ? new Request(event.request, { cache: 'no-store' }) : event.request;
  const networkFirst = () => fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(event.request.mode === 'navigate' ? '/' : event.request, response.clone());
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return (await caches.match('/')) ?? Response.error();
    return Response.error();
  });
  event.respondWith(url.pathname.startsWith('/assets/') ? caches.match(event.request).then((cached) => cached ?? networkFirst()) : networkFirst());
});
