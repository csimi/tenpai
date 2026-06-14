// Minimal service worker: required for the browser install prompt and lets the
// installed app launch offline. Vite emits content-hashed asset filenames, so a
// cache-first runtime cache never serves stale *assets*. But index.html is not
// hashed, so it's served network-first (see fetch handler) — otherwise a cached
// index.html would keep pointing at a previous build's assets after a deploy.
const CACHE = 'tenpai-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

// Cache the latest response for a request, then return it.
const cacheAndReturn = (request, response) => {
  if (response.ok) {
    const copy = response.clone()
    caches.open(CACHE).then((cache) => cache.put(request, copy))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // Navigations (index.html) are network-first so a new deploy is picked up as
  // soon as the device is online, falling back to cache when offline. The hashed
  // assets it then references are served cache-first below.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => cacheAndReturn(request, response))
        .catch(() => caches.match(request))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => cacheAndReturn(request, response))
        .catch(() => cached)
      return cached || network
    })
  )
})
