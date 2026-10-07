/* THE UPDATE PATH: an old worker installed, a new build landing.
 *
 *   node update.js
 *
 * WHY. On 2026-10-03 BZ looked for a feature twice and could not find it. It
 * was live both times; his copy was two builds behind. The app looked broken
 * and nothing in this project had ever driven the one path that makes that
 * happen - a service worker already installed when a new build arrives.
 *
 * NOTHING ELSE CAN DRIVE IT. Every other browser check serves the app from a
 * route interception on http://app.local, which is not a secure origin, so a
 * service worker cannot register there at all: sync.js proves the SYNC cycle
 * with no worker in the picture. This one serves over 127.0.0.1, which the
 * browser treats as secure, so the worker is real.
 *
 * WHAT IT ASKS, in the order the fault happens:
 *
 *   The worker installs and the app opens.
 *   The app still opens with the network cut, which is what the worker is for.
 *   A NEW BUILD LANDS and the app ends up on it rather than serving the old
 *   one out of cache forever - which is the fault BZ met.
 *   The old cache does not survive beside the new one, because two caches is
 *   how a half-updated app serves one version's page and another's worker.
 */
const { chromium } = require('playwright');
const http = require('http');
const path = require('path'), fs = require('fs');
const dir = __dirname;

let fails = 0, checks = 0;
function ok(w) { checks++; console.log('  ✓ ' + w); }
function bad(w, d) {
  checks++; fails++;
  console.log('  ✖ ' + w);
  if (d) String(d).split('\n').slice(0, 5).forEach(l => console.log('      ' + l));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

/* THE VERSION THE SERVER IS SERVING. Swapped between loads, which is exactly
   what a deploy does to a phone that already has the app. */
let serving = null;          // null = the build as it stands on disk

/* WHAT THIS BUILD CALLS ITSELF, off the one line that says so. A stand-in
   deploy that cannot find the version is not a passing test, so this stops
   rather than quietly serving the same bytes twice. */
const NOW = (String(fs.readFileSync(path.join(dir, 'index.html')))
  .match(/APP_VERSION = '([0-9][0-9.]*)'/) || [])[1];
if (!NOW) {
  console.log('  ✖ update: no APP_VERSION in index.html - nothing to swap');
  process.exit(1);
}

function body(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p);
  if (!serving || (name !== 'index.html' && name !== 'sw.js')) return raw;
  /* A BUILD IS ITS VERSION STRING, everywhere bump.py writes one. Rewriting
     them is the smallest honest stand-in for a deploy: same files, new build.
     READ OFF THE BUILD, never typed: this said /2\.7\.\d+/ and matched
     nothing the moment the version reached 2.8.0, so the "new" build served
     was byte-identical and the worker was called broken for doing the right
     thing with it (2026-10-06). */
  return Buffer.from(String(raw).split(NOW).join(serving), 'utf8');
}

(async () => {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0].slice(1)) || 'index.html';
    const b = body(name);
    if (!b) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(name)] || 'text/plain',
      /* NO BROWSER CACHE, so the only cache in the picture is the worker's -
         which is the thing under test. */
      'Cache-Control': 'no-store'
    });
    res.end(b);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origin = 'http://127.0.0.1:' + port;

  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));

  const version = () => p.evaluate(() => (typeof APP_VERSION === 'string'
    ? APP_VERSION : (document.querySelector('.ver') || {}).textContent) || '?');
  const caches_ = () => p.evaluate(() => caches.keys());
  const settled = async () => {
    await p.waitForFunction(() => navigator.serviceWorker
      && navigator.serviceWorker.controller, null, { timeout: 15000 })
      .catch(() => {});
    await p.waitForTimeout(600);
  };

  await p.goto(origin + '/index.html');
  await p.waitForTimeout(1500);
  await settled();

  const first = await version();
  const controlled = await p.evaluate(() =>
    !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  if (controlled) ok('the worker installs and takes the page');
  else bad('the worker installs and takes the page',
    'no controller after load - every check below is about a worker that '
    + 'is not there');
  const keys1 = await caches_();
  if (keys1.length === 1) ok('and it keeps exactly one cache: ' + keys1[0]);
  else bad('and it keeps exactly one cache', 'found ' + JSON.stringify(keys1));

  /* THE WHOLE POINT OF A WORKER. */
  await ctx.setOffline(true);
  await p.reload().catch(() => {});
  await p.waitForTimeout(900);
  const offlineV = await version().catch(() => null);
  if (offlineV === first) ok('the app still opens with the network cut');
  else bad('the app still opens with the network cut',
    'got ' + JSON.stringify(offlineV) + ' where it was ' + JSON.stringify(first));
  await ctx.setOffline(false);

  /* AND NOW A NEW BUILD LANDS, which is what BZ met twice in one day. */
  serving = '2.9.99';
  await p.reload();
  await p.waitForTimeout(1200);
  await settled();
  /* A WORKER TAKES OVER ON THE LOAD AFTER THE ONE THAT FOUND IT. That is how
     the platform works and is not the fault: the fault would be never. The app
     also waits for an idle screen before activating, so it is given a second
     load rather than being called broken on the first. */
  await p.reload();
  await p.waitForTimeout(1500);
  await settled();
  const after = await version();
  if (after === '2.9.99') {
    ok('a new build lands rather than being served out of cache forever');
  } else {
    bad('a new build lands rather than being served out of cache forever',
      'still on ' + after + ' after two reloads against a 2.9.99 server - '
      + 'this is what "I still do not see it" looks like');
  }

  const keys2 = await caches_();
  const stale = keys2.filter(k => k.indexOf(first) >= 0);
  if (!stale.length) ok('and the old cache does not survive beside the new one');
  else bad('and the old cache does not survive beside the new one',
    'still holding ' + JSON.stringify(stale) + ' alongside '
    + JSON.stringify(keys2.filter(k => stale.indexOf(k) < 0)));

  if (threw.length) {
    bad('nothing threw while updating', threw.slice(0, 3).join(' | '));
  } else ok('nothing threw while updating');

  await b.close();
  server.close();
  console.log('\n  ' + (fails ? '✖ ' + fails + ' of ' + checks
    + ' failed' : '✓ all ' + checks + ' pass'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  ✖ the update check threw: ' + e.message);
  process.exit(1); });
