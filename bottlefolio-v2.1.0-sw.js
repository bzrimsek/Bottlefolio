// Killer B's Bottle Tracker service worker.
// CACHE_NAME is written by bump.py — never by hand.
const CACHE_NAME = 'bottlefolio-v2.1.0';

// The shell: everything needed to open the app with no network.
/* zxing.min.js is the barcode decoder for browsers with no BarcodeDetector,
   which means every iPhone. Precached rather than fetched on demand
   because scanning happens standing in a shop, and a shop is exactly where
   there is no signal to fetch a decoder with. 330KB once, against a scan
   that fails at the only moment it matters. */
/* WHAT THE APP CANNOT OPEN WITHOUT, and nothing else.

   Every one of these has to cache or the install fails — which is right,
   and which makes the list itself dangerous. mark.png, the icons and the
   barcode decoder were all in here: any one of them missing or 404ing on
   the live site would fail every install, forever, and the symptom is a
   phone that never updates or updates to nothing.

   An icon that will not download costs a picture. index.html that will
   not download costs the app. They do not belong in the same list. */
/* index.html is the only thing the app genuinely cannot open without.
   './' is the same file under another name and is cached best-effort: if a
   redirect or a proxy makes that one request behave oddly, it must not
   take the whole install down with it — a failed install is silent, and a
   silently failing install means a device that never updates again. */
const SHELL = ['./index.html'];
const ALSO = ['./'];

/* Wanted, and never a reason to fail an install. zxing is the barcode
   decoder for browsers with no BarcodeDetector, which means every iPhone —
   precached because scanning happens standing in a shop and a shop is
   where there is no signal to fetch a decoder with. Worth having, not
   worth blocking a release for. */
const EXTRAS = ['./manifest.json', './mark.png', './icon-192.png',
                './icon-512.png', './zxing.min.js'];

// Data files are cached too, but served network-first (see below) because a
// stale shelf is worse than a slow one. This app is used at home and in
// shops, not on the back nine, so freshness beats offline-first here.
const DATA = ['./data.json', './map.json'];

/* AN INSTALL THAT CANNOT CACHE MUST FAIL.

   The catch here swallowed a precache failure, so waitUntil resolved and
   the install SUCCEEDED with an empty or half-filled cache. Activate then
   deleted the old cache, claimed the page, and the reload landed on
   nothing — which is why a phone taking an update came back with the tabs
   missing, and why clearing the site fixed it: that forced a fetch over
   the network instead of a cache-first miss.

   Failing the install is the correct outcome. The old worker stays in
   charge, the old cache stays intact, and the update is taken on the next
   visit when the network is willing. A version that will not download is
   better than a version that half-downloads.

   The SHELL must be there; the DATA files are cached as a convenience and
   are network-first anyway, so they cannot hold an install back. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      c.addAll(SHELL).catch(err => {
        /* SAY SO. An install that fails takes no update with it and writes
           nothing anywhere: BZ had two devices that stopped updating and
           the only sign was "service worker: false" on a diagnostics
           screen. Now every open page is told, and the app writes it into
           the log where it will be read. */
        return self.clients.matchAll({ includeUncontrolled: true })
          .then(cs => cs.forEach(c2 => c2.postMessage({
            type: 'SW_INSTALL_FAILED',
            why: String((err && err.message) || err)
          })))
          .then(() => { throw err; });
      }).then(() =>
        // Best effort, and never a reason to fail: an icon that will not
        // download costs a picture, and a stale data.json is refetched on
        // first use.
        Promise.all(ALSO.concat(EXTRAS).concat(DATA)
          .map(x => c.add(x).catch(() => null)))
      )
    )
  );
});

/* And do not throw the old cache away until the new one can stand up.

   Deleting first meant a cache that turned out to be short left the app
   with neither. Checking the shell is actually there costs one lookup and
   makes the delete safe. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.match('./index.html'))
      .then(hit => {
        if (!hit) return null;         // keep the old cache; it still works
        return caches.keys().then(keys => Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))));
      })
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
      }).catch(() =>
        /* Last resort: ANY cache, not just the current one. After a
           half-taken update the current cache can be the empty one, and
           looking only there returns undefined — which is a broken page
           rather than an old one. */
        caches.match('./index.html', { ignoreSearch: true }));
    })
  );
});
