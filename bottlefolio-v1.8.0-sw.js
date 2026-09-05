// Killer B's Bottle Tracker service worker.
// CACHE_NAME is written by bump.py — never by hand.
const CACHE_NAME = 'bottlefolio-v1.8.0';

// The shell: everything needed to open the app with no network.
/* zxing.min.js is the barcode decoder for browsers with no BarcodeDetector,
   which means every iPhone. Precached rather than fetched on demand
   because scanning happens standing in a shop, and a shop is exactly where
   there is no signal to fetch a decoder with. 330KB once, against a scan
   that fails at the only moment it matters. */
const SHELL = ['./', './index.html', './manifest.json',
               './mark.png', './icon-192.png', './icon-512.png',
               './zxing.min.js'];

// Data files are cached too, but served network-first (see below) because a
// stale shelf is worse than a slow one. This app is used at home and in
// shops, not on the back nine, so freshness beats offline-first here.
const DATA = ['./data.json', './map.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL.concat(DATA)))
      // Do not take over mid-session; the page decides when, by posting
      // SKIP_WAITING once nothing is half-finished on screen.
      .catch(err => console.warn('precache failed:', err))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks for the update when it is safe to take it.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isData(url) {
  return DATA.some(d => url.pathname.endsWith(d.replace('./', '/')));
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // fonts and CDNs handle themselves

  if (isData(url)) {
    // Network first, cache as a fallback: the shelf should be current when
    // there is a connection and still open when there is not.
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else: cache first, since the shell only changes on a bump.
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
