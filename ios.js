/* THE APP IN WEBKIT, WHICH IS THE ENGINE iOS SHIPS.
 *
 * Every other browser check in this project drives Chromium: browser.js,
 * sync.js, screens.js, render.js, twotab.js, shots.js, seq.js. So a fault that
 * only appears in WebKit could not be seen here at all, and on 2026-09-29 iOS
 * users reported two - scrolling trouble and no way to save a file - against a
 * green gate of fifteen checks.
 *
 * This walks the screens at iPhone size in WebKit and asks the two questions
 * those reports raise: does the screen scroll, and does a file actually reach
 * the person. It is not an iPhone - there is no moving toolbar here and no
 * Files app - so it cannot prove the app is well on iOS. It can prove the app
 * is not broken in the engine iOS uses, which nothing did before.
 *
 * Run: node ios.js
 */
const { webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

let checks = 0, fails = 0;
const ok = w => { checks++; console.log('  ✓ ' + w); };
const bad = (w, d) => {
  checks++; fails++;
  console.log('  ✖ ' + w);
  if (d) String(d).split('\n').slice(0, 6).forEach(l => console.log('      ' + l));
};

/* The screens a person reaches from the bar or a tile. Named by their element,
 * because show() takes that name. */
const SCREENS = ['home', 'shelf', 'flights', 'pour', 'map', 'ref',
  'settings', 'library', 'buddies', 'shop', 'guide'];

const serve = (p, dir) => p.route('http://app.local/**', r => {
  const n = r.request().url().split('app.local/')[1].split('?')[0]
    || 'index.html';
  const f = path.join(dir, n);
  if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
  const t = n.endsWith('.json') ? 'application/json'
    : n.endsWith('.js') ? 'text/javascript'
    : n.endsWith('.png') ? 'image/png' : 'text/html';
  r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
});

(async () => {
  const dir = __dirname;
  const b = await webkit.launch();
  const p = await b.newPage(Object.assign({ acceptDownloads: true },
    devices['iPhone 13']));
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));
  await serve(p, dir);
  await p.goto('http://app.local/index.html');
  await p.waitForTimeout(1500);

  /* BZ's real shelf, so the screens have more on them than a phone can show.
   * An empty shelf scrolls beautifully because there is nothing on it. */
  const { bottles, custom, flights } = require('./engine.js').shelf(dir);
  await p.evaluate(([bs, cu, fl]) => {
    S.bottles = bs; S.custom = cu;
    if (fl && fl.length) S.customFlights = fl;
    save_(); rebuildCatalog();
  }, [bottles, custom, flights]);

  if (threw.length) {
    bad('the app loads in WebKit without throwing', threw.join('\n'));
  } else {
    ok('the app loads in WebKit without throwing');
  }

  /* ---- THE SCREENS SCROLL. */
  const stuck = [], clipped = [], bodyScrolls = [], navGone = [], blocked = [];
  let scrollers = 0;
  for (const name of SCREENS) {
    const drew = await p.evaluate(n => {
      try { show(n); } catch (e) { return 'THREW ' + e.message; }
      const el = document.getElementById('scr-' + n);
      return el && el.classList.contains('on') ? 'ok' : 'did not open';
    }, name);
    if (drew !== 'ok') { bad('the ' + name + ' screen opens', drew); continue; }
    await p.waitForTimeout(350);

    const m = await p.evaluate(n => {
      const el = document.getElementById('scr-' + n);
      const doc = document.scrollingElement || document.documentElement;
      el.scrollTop = 0;
      const room = el.scrollHeight - el.clientHeight;
      el.scrollTop = 200;
      const moved = el.scrollTop;
      /* WHAT A FINGER IN THE MIDDLE OF THE SCREEN LANDS ON. An overlay left
         open over the page takes the gesture and nothing scrolls, which is
         indistinguishable from a scroller that does not work. */
      const mid = document.elementFromPoint(
        Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      const nav = document.querySelector('nav');
      const r = nav && nav.getBoundingClientRect();
      return {
        room: room,
        moved: moved,
        /* WHAT A FINGER CAN DO, which is not what scrollTop can do: setting
           scrollTop moves an overflow:hidden box perfectly well, so the
           movement above cannot tell a scroller from a clipped one. The
           computed value is the thing that decides whether a drag scrolls. */
        overflowY: getComputedStyle(el).overflowY,
        bodyRoom: doc.scrollHeight - doc.clientHeight,
        /* The CENTRE of the screen, where the bar never is: allowing the nav
           here would excuse an overlay that covers everything, which is the
           one thing this is looking for. */
        onScreen: !!(mid && (el.contains(mid) || mid === el)),
        hit: mid ? (mid.id || mid.className || mid.tagName).toString()
          .slice(0, 30) : 'nothing',
        navBottom: r ? Math.round(r.bottom) : null,
        h: window.innerHeight
      };
    }, name);

    if (m.room > 4) {
      scrollers++;
      if (m.moved < Math.min(200, m.room) - 2) {
        stuck.push(name + ': ' + m.room + 'px to scroll, moved ' + m.moved);
      }
      if (m.overflowY !== 'auto' && m.overflowY !== 'scroll') {
        clipped.push(name + ': ' + m.room + 'px past the bottom and overflow-y '
          + 'is ' + m.overflowY + ', so a drag does nothing');
      }
    }
    /* THE BODY MUST NEVER SCROLL. The nav is the last child of a column sized
       to the viewport, so a scrolling body takes the bar off the bottom with
       it - which is the fault the CSS comments have been fighting for weeks. */
    if (m.bodyRoom > 1) {
      bodyScrolls.push(name + ': the body has ' + m.bodyRoom + 'px to scroll');
    }
    if (m.navBottom === null || m.navBottom > m.h + 1) {
      navGone.push(name + ': nav ends at ' + m.navBottom + ' of ' + m.h);
    }
    if (!m.onScreen) blocked.push(name + ': a touch lands on ' + m.hit);
  }

  if (scrollers < 3) {
    bad('enough screens have something to scroll to be worth asking',
      'only ' + scrollers + ' of ' + SCREENS.length + ' overflowed - the '
      + 'shelf did not load, so this check proved nothing');
  } else {
    ok(scrollers + ' of ' + SCREENS.length + ' screens overflow a phone');
  }
  if (stuck.length) bad('every screen with more than a screenful scrolls', stuck.join('\n'));
  else ok('every screen with more than a screenful scrolls');
  if (clipped.length) bad('a screen with more than fits is a scroller, not a clipped box', clipped.join('\n'));
  else ok('a screen with more than fits is a scroller, not a clipped box');
  if (bodyScrolls.length) bad('the page itself never scrolls, only the screen', bodyScrolls.join('\n'));
  else ok('the page itself never scrolls, only the screen');
  if (navGone.length) bad('the bar stays on the glass', navGone.join('\n'));
  else ok('the bar stays on the glass');
  if (blocked.length) bad('nothing invisible is covering the screen', blocked.join('\n'));
  else ok('nothing invisible is covering the screen');

  /* ---- THE BOOT LINE REPORTS WHAT IT SAYS IT REPORTS.
   *
   * It read "safe-area 58px" and that number was --nav-h, the height of the
   * bar. So every log ever written answered "is the bottom inset the problem"
   * with something else, and looked like an answer - it misled me while I was
   * hunting the scrolling reports (2026-09-30). The nav carries
   * padding-bottom: env(safe-area-inset-bottom), so its computed padding is
   * the real inset and the two numbers must not be confused again. */
  const boot = await p.evaluate(() => {
    const n = document.querySelector('nav');
    return {
      line: ((typeof S !== 'undefined' && S.log) || [])
        .find(l => /boot[^:]*: nav /.test(l)) || '',
      inset: getComputedStyle(n).paddingBottom,
      navH: getComputedStyle(document.documentElement)
        .getPropertyValue('--nav-h').trim()
    };
  });
  const said = k => (boot.line.match(new RegExp(k + ' (\\S+)')) || [])[1];
  if (!boot.line) {
    bad('the boot line records the bar and the inset', 'no boot line was written');
  } else if (said('safe-area') !== boot.inset) {
    bad('the boot line records the bar and the inset',
      'it says safe-area ' + said('safe-area') + ' and the inset is '
      + boot.inset + (said('safe-area') === boot.navH
        ? ' — it is printing the bar height under that name' : ''));
  } else if (said('bar') !== boot.navH) {
    bad('the boot line records the bar and the inset',
      'it says bar ' + said('bar') + ' and the bar is ' + boot.navH);
  } else {
    ok('the boot line records the bar (' + boot.navH + ') and the inset ('
      + boot.inset + ') as two different things');
  }

  /* ---- A MEASUREMENT THAT WAS NEVER TAKEN IS NOT A FAULT TO CORRECT.
   *
   * navSelfHeal rewrites --app-h and lays the whole app out again when the bar
   * is not where the measured height says it should be. A bar that has not
   * been laid out yet returns a rect of zeroes, and a bottom of 0 satisfies
   * that test perfectly: every one of the 84 re-measures in the live logs was
   * this case, never a real mismatch, and it nearly always ran all three
   * times - a triple relayout at the moment a phone comes back or a keyboard
   * moves. */
  /* COUNTING THE WRITES, not comparing the value: the correction sets --app-h
     to the height it just measured, which is usually the value already there,
     so the string does not change and the relayout happens anyway. Comparing
     before and after saw nothing and passed with the guard removed - which is
     how this check was vacuous when first written.

     A FRESH PAGE FIRST, because navSelfHeal stops after three corrections and
     a page that has been driven through eleven screens may have spent them,
     which would make it return early and pass for the wrong reason. */
  await p.goto('http://app.local/index.html');
  await p.waitForTimeout(1200);

  const heal = await p.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector('nav');
    const real = root.style.setProperty.bind(root.style);
    let writes = 0;
    root.style.setProperty = function (k, v) {
      if (k === '--app-h') writes++;
      return real(k, v);
    };
    const count = fn => { writes = 0; fn(); return writes; };

    const was = nav.style.display;
    nav.style.display = 'none';              // a bar with no box at all
    const onNoBox = count(() => navSelfHeal());
    nav.style.display = was;

    /* THE CONTROL. A bar that IS laid out, against a height that is plainly
       wrong: the correction must still fire, or the guard above has simply
       switched self-healing off and the check above proves nothing. */
    const keep = root.style.getPropertyValue('--app-h');
    real('--app-h', (window.innerHeight + 300) + 'px');
    const onWrong = count(() => navSelfHeal());
    real('--app-h', keep);
    root.style.setProperty = real;
    return { onNoBox: onNoBox, onWrong: onWrong,
      navHeight: Math.round(nav.getBoundingClientRect().height) };
  });

  if (heal.onNoBox === 0) ok('a bar with no box is waited for, not corrected');
  else bad('a bar with no box is waited for, not corrected',
    'navSelfHeal wrote --app-h ' + heal.onNoBox + ' time(s) on a measurement '
    + 'that was never taken - each one lays the whole app out again');

  if (heal.onWrong > 0) {
    ok('and a bar that really is in the wrong place is still corrected');
  } else {
    bad('and a bar that really is in the wrong place is still corrected',
      'the height was set ' + (heal.navHeight ? '300px' : '?') + ' too tall '
      + 'and nothing was re-measured, so the no-box guard has switched the '
      + 'self-healing off altogether');
  }

  /* ---- A FILE REACHES THE PERSON.
   *
   * iOS users reported no download option, and a home-screen iOS app presents
   * no file download at all. saveFile hands the file to the share sheet there,
   * which is the only route that exists. */
  const share = await p.evaluate(() => {
    const seen = {};
    navigator.canShare = o => !!(o && o.files && o.files.length);
    navigator.share = o => {
      seen.name = o.files[0].name;
      seen.size = o.files[0].size;
      return Promise.resolve();
    };
    saveFile('bottlefolio-backup-probe.json',
      new Blob(['{"shelf":1}'], { type: 'application/json' }));
    return new Promise(r => setTimeout(() => r(seen), 250));
  });
  if (share.name === 'bottlefolio-backup-probe.json' && share.size > 0) {
    ok('a file is handed to the share sheet on an iPhone, named and whole');
  } else {
    bad('a file is handed to the share sheet on an iPhone, named and whole',
      JSON.stringify(share));
  }

  /* A HOME-SCREEN iPHONE THAT THE PLATFORM WILL NOT SHARE FOR.
   *
   * The route that matters, because both other routes are dead ends there: iOS
   * is choosy about which file types it will share and this app hands over
   * application/json and text/csv, while a home-screen app presents no
   * download at all. A refusal used to fall back to the anchor, so the button
   * did nothing and said nothing - the complaint this started from. */
  const tab = await p.evaluate(() => {
    let opened = null;
    const realOpen = window.open;
    let toasted = '';
    const realToast = window.toast;
    navigator.canShare = () => false;
    navigator.share = () => Promise.reject(new Error('should not be called'));
    try {
      Object.defineProperty(window.navigator, 'standalone',
        { value: true, configurable: true });
    } catch (e) { /* already defined by the engine */ }
    window.open = u => { opened = String(u); return { closed: false }; };
    try { window.toast = m => { toasted = String(m); }; } catch (e) {}
    let clicked = false;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicked = true; };
    saveFile('bottlefolio-backup-probe.json',
      new Blob(['{"a":1}'], { type: 'application/json' }));
    HTMLAnchorElement.prototype.click = realClick;
    window.open = realOpen;
    if (realToast) window.toast = realToast;
    const was = window.navigator.standalone === true;
    /* PUT IT BACK. Left set, every later check reads as a home-screen app and
       takes this route instead of its own - which is how the two download
       checks below failed on a page this test had quietly changed. */
    try {
      Object.defineProperty(window.navigator, 'standalone',
        { value: undefined, configurable: true });
    } catch (e) { /* nothing to undo */ }
    return { opened: opened, clicked: clicked, toasted: toasted,
      standalone: was, restored: window.navigator.standalone !== true };
  });
  if (!tab.restored) {
    bad('the standalone flag is put back after the test',
      'it stayed set, so every check after this one reads as a home-screen app');
  }
  if (!tab.standalone) {
    bad('a home-screen iPhone that cannot share still gets the file',
      'the standalone flag could not be set, so this proved nothing');
  } else if (tab.opened && /^blob:/.test(tab.opened)) {
    ok('a home-screen iPhone that cannot share gets the file in a tab');
  } else {
    bad('a home-screen iPhone that cannot share still gets the file',
      'nothing opened' + (tab.clicked
        ? ' — it fell back to a download, which a home-screen app '
          + 'does not present' : ' and nothing was said'));
  }

  /* CLOSING THE SHEET IS NOT A FAILURE. Falling back would save a second copy
     behind the back of somebody who just said no. */
  const cancelled = await p.evaluate(() => {
    let fell = false;
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(
      Object.assign(new Error('closed'), { name: 'AbortError' }));
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { fell = true; };
    saveFile('a.json', new Blob(['{}'], { type: 'application/json' }));
    return new Promise(r => setTimeout(() => {
      HTMLAnchorElement.prototype.click = real; r(fell);
    }, 250));
  });
  if (cancelled) bad('closing the share sheet saves nothing', 'it saved a file anyway');
  else ok('closing the share sheet saves nothing');

  /* A SHEET THAT WILL NOT OPEN MUST NOT EAT THE FILE. */
  const refused = await p.evaluate(() => {
    let fell = false;
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(
      Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { fell = true; };
    saveFile('b.json', new Blob(['{}'], { type: 'application/json' }));
    return new Promise(r => setTimeout(() => {
      HTMLAnchorElement.prototype.click = real; r(fell);
    }, 250));
  });
  if (refused) ok('a share sheet that will not open falls back to saving');
  else bad('a share sheet that will not open falls back to saving',
    'the file was dropped and nothing was said');

  /* THE ANCHOR IS IN THE DOCUMENT WHEN IT IS CLICKED. Belt and braces rather
     than a diagnosis - a detached anchor downloads in this WebKit - but a
     detached one has broken on older Safari and costs nothing to avoid. */
  const attached = await p.evaluate(() => {
    let connected = null;
    navigator.canShare = () => false;      // force the anchor
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      connected = this.isConnected;
    };
    saveFile('c.csv', new Blob(['a,b'], { type: 'text/csv' }));
    HTMLAnchorElement.prototype.click = real;
    return connected;
  });
  if (attached === true) ok('the anchor is in the document when it is clicked');
  else bad('the anchor is in the document when it is clicked',
    'isConnected was ' + attached);

  /* AND THE FILE DOWNLOADS, in the engine iOS uses. */
  const got = p.waitForEvent('download', { timeout: 5000 })
    .then(d => d.suggestedFilename()).catch(() => null);
  await p.evaluate(() => {
    navigator.canShare = () => false;
    saveFile('bottlefolio-probe.csv', new Blob(['a,b\n1,2'],
      { type: 'text/csv' }));
  });
  const name = await got;
  if (name === 'bottlefolio-probe.csv') ok('and the file downloads in WebKit');
  else bad('and the file downloads in WebKit', 'got ' + name);

  await b.close();
  console.log(fails
    ? '✖ ' + fails + ' of ' + checks + ' WebKit checks found something'
    : '✓ all ' + checks + ' WebKit checks pass');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('✖ ios.js threw: ' + (e.stack || e.message));
  process.exit(1);
});
