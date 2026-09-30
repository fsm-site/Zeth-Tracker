/* Bam's Masterlist — service worker
   - App shell (page, manifest, icons) is cached so the app opens instantly
     and still loads when the connection drops.
   - The page itself is fetched network-first, so every update you publish
     shows up on the next open; the cached copy is only a fallback.
   - Firebase sign-in and Firestore data are NEVER cached — they always go
     straight to Google, so your data is always the live copy.
   Bump CACHE_VERSION whenever you change this file's list of assets. */
const CACHE_VERSION = 'masterlist-v3';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
];

// Requests that must always hit the network (auth + database).
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'www.googleapis.com',
  'google-analytics.com',
  'googletagmanager.com',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => Promise.all(SHELL_ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {}) // a missing icon shouldn't block install
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(NEVER_CACHE.some(host => url.hostname.includes(host))) return;

  // The page: network first, fall back to the cached shell when offline.
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req)
        .then(res => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Firebase SDK files (versioned URLs, never change) + Google Fonts:
  // cache first, refresh in the background.
  if(url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Same-origin files (icons, manifest): cache first, then network.
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if(res && res.ok){
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
