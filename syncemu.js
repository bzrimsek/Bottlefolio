/* SYNC, AGAINST A REAL DATABASE. Run by rulestest.js inside the emulator.
 *
 * sync.js drives the sync cycle against fake-firebase.js, an in-memory
 * stand-in. This drives it against Google's database and auth emulators,
 * with the real Firebase SDK and the real rules, as two devices on one
 * account - the three faults that have cost the most:
 *   1. a bottle added on one device arrives on the other, live;
 *   2. a wishlist entry removed on one device stays removed when the other
 *      reloads (the resurrection class);
 *   3. a second account signing in on the same browser is not handed the
 *      first account's shelf.
 *
 * Exports one async function; returns the number of failures.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIR = __dirname;
const DB = 'http://127.0.0.1:9000';
const NS = 'bottlefolio-default-rtdb';
const WAIT = 8000;

/* The emulator loads firebase.json's rules for the emulator's own project;
   the app talks to its real namespace, so the same rules go there too. */
async function loadRules() {
  const r = await fetch(DB + '/.settings/rules.json?ns=' + NS, {
    method: 'PUT', headers: { Authorization: 'Bearer owner' },
    body: fs.readFileSync(path.join(DIR, 'firebase-rules.json'), 'utf8') });
  if (!r.ok) throw new Error('rules did not load: HTTP ' + r.status);
}

/* A device: its own browser storage, the app from disk, the real SDK from
   gstatic with one line appended that points it at the emulators. */
async function device(browser) {
  /* No service worker: it would sit between the app and the emulator. */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 },
    serviceWorkers: 'block' });
  const errors = [];
  await ctx.route('https://www.gstatic.com/firebasejs/**', async route => {
    const res = await route.fetch();
    let body = await res.text();
    if (route.request().url().indexOf('firebase-database-compat') >= 0) {
      body += '\n;(function(){var init=firebase.initializeApp;'
        + 'firebase.initializeApp=function(){var a=init.apply(this,arguments);'
        + "firebase.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true});"
        + "firebase.database().useEmulator('127.0.0.1',9000);return a;};})();";
    }
    return route.fulfill({ response: res, body: body });
  });
  await ctx.route('http://localhost:5199/**', route => {
    const name = route.request().url().split('localhost:5199/')[1].split('?')[0] || 'index.html';
    const p = path.join(DIR, name);
    if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
    const type = name.endsWith('.json') ? 'application/json'
      : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.png') ? 'image/png' : 'text/html';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
  });
  await ctx.addInitScript(() => localStorage.setItem('kb_signedin', '1'));
  const open = async () => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:5199/index.html');
    await page.waitForFunction(() => typeof FB !== 'undefined' && FB.ready, null, { timeout: WAIT * 2 });
    return page;
  };
  return { ctx, open, errors };
}

const signIn = async (page, email) => {
  const err = await page.evaluate(async em => {
    const auth = firebase.auth();
    try { await auth.signInWithEmailAndPassword(em, 'emulator-only'); return null; }
    catch (e) {
      try { await auth.createUserWithEmailAndPassword(em, 'emulator-only'); return null; }
      catch (e2) { return (e2 && (e2.code + ' ' + e2.message)) || String(e2); }
    }
  }, email);
  if (err) {
    const up = await fetch('http://127.0.0.1:9099/').then(r => 'HTTP ' + r.status).catch(e => 'unreachable: ' + e.message);
    const cfg = await page.evaluate(() => JSON.stringify(firebase.auth().emulatorConfig || null));
    throw new Error('sign-in on the emulator failed: ' + err + ' | auth emulator ' + up + ' | app pointed at ' + cfg);
  }
};

const loaded = page => page.waitForFunction(() => FB.loaded, null, { timeout: WAIT });

module.exports = async function syncOnEmulator() {
  let failed = 0;
  const say = (ok, what, why) => {
    if (ok) console.log('  ✓ ' + what);
    else { failed++; console.log('  ✖ ' + what + (why ? '\n      ' + why : '')); }
  };
  await loadRules();
  /* A page on a public-looking origin may not call 127.0.0.1 (Chrome's private
     network rules), so the app is served from localhost. */
  const browser = await chromium.launch({ args: [
    '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks'] });
  try {
    const A = await device(browser), B = await device(browser);
    const a = await A.open(), b = await B.open();
    await signIn(a, 'bz@example.com');
    await loaded(a);
    await signIn(b, 'bz@example.com');
    await loaded(b);

    /* 1. Added on A, arrives on B. */
    await a.evaluate(() => {
      S.bottles = (S.bottles || []).concat([{ id: 'B7001', k: 'Ardbeg Ten', status: 'open' }]);
      save_();
    });
    let got = await b.waitForFunction(() => (S.bottles || []).some(x => x.id === 'B7001'),
      null, { timeout: WAIT }).then(() => true).catch(() => false);
    say(got, 'a bottle added on one device arrives on the other, live');

    /* 2. Wished on A, removed on B, and A reloads: it stays removed. */
    await a.evaluate(() => { S.wish = L.wishAdd(S.wish, { name: 'Springbank 10' }); save_(); });
    got = await b.waitForFunction(() => L.onWishlist(S.wish, 'Springbank 10'),
      null, { timeout: WAIT }).then(() => true).catch(() => false);
    say(got, 'a wishlist entry reaches the other device');
    await b.evaluate(() => { unwish('Springbank 10'); save_(); });
    await b.waitForTimeout(2500);
    await a.close();
    const a2 = await A.open();
    await loaded(a2);
    await a2.waitForTimeout(2500);
    const back = await a2.evaluate(() => L.onWishlist(S.wish, 'Springbank 10'));
    say(!back, 'removed on one device, it stays removed when the other reloads',
      back ? 'Springbank 10 came back on the wishlist' : '');

    /* 3. Another account on device B's browser. */
    await b.evaluate(() => fbSignOut());
    await b.close();
    const b2 = await B.open();
    await signIn(b2, 'somebody-else@example.com');
    await loaded(b2);
    await b2.waitForTimeout(2500);
    const theirs = await b2.evaluate(() => ({
      local: (S.bottles || []).some(x => x.id === 'B7001'),
      uid: FB.user.uid }));
    const acct = await (await fetch(DB + '/bz-apps/whisky/' + theirs.uid
      + '/bottles.json?ns=' + NS, { headers: { Authorization: 'Bearer owner' } })).json();
    const leaked = theirs.local || JSON.stringify(acct || '').indexOf('B7001') >= 0;
    say(!leaked, 'a second account on the same browser is not handed the first one’s shelf',
      leaked ? 'the first account’s bottle reached the second account' : '');

    const errs = A.errors.concat(B.errors);
    say(!errs.length, 'nothing threw', errs.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  return failed;
};
