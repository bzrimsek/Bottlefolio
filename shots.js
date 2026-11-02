/* Every screen, at phone size, photographed and measured.
 *
 *   node shots.js [--keep]
 *
 * WHY. On 2026-09-15 a flight title was squashed to 22px of usable width
 * on a phone. Every check passed: the screen drew, the engine agreed with
 * it, the walk clicked through it, and nothing anywhere asked how WIDE
 * anything was. It was found by taking a screenshot and looking.
 *
 * So the screenshots are taken every build now, and the two faults that
 * can be measured are measured: a page that scrolls sideways, and an
 * element wider than the box it sits in. Both are invisible to a desktop
 * viewport and both are what a phone shows first.
 *
 * The images land in shots/ for somebody to flip through before a visual
 * release; the gate keeps them as an artifact. They are not compared to
 * stored images - a pixel comparison of a page whose content changes every
 * build fails for the wrong reason every time, and a check that cries wolf
 * is a check that gets turned off.
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const dir = __dirname;
const OUT = path.join(dir, 'shots');
const PHONE = { width: 390, height: 844 };      // iPhone 14/15, portrait

let fails = 0, checks = 0;
function ok(w) { checks++; console.log('  ✓ ' + w); }
function bad(w, d) {
  checks++; fails++;
  console.log('  ✖ ' + w);
  if (d) String(d).split('\n').slice(0, 8).forEach(l => console.log('      ' + l));
}

/* EACH SCREEN, THE FUNCTION THAT DRAWS IT, AND THE ELEMENT IT DRAWS INTO.
   THE ID IS NAMED HERE RATHER THAN IN A MAP FURTHER DOWN (2026-11-02). It
   WAS in a map, and two of its nine names were wrong: scr-log and scr-info
   do not exist and never did. getElementById answered null, no screen was
   switched on, and the photograph was of a blank page with the nav floated
   to the top - log.png had been that blank page for as long as anyone can
   tell. The measurement said "fits a 390px phone" each time, because it
   fell back to document.body and an empty body overflows nothing. Two of
   nine screens were neither photographed nor measured, and the check was
   green for both. An unknown id is a FAILURE now, not a fallback.

   `prep` is what the screen needs to be the thing it is named after: the
   pour history is the Pour screen with POUR.where set to it, which is why
   its id is scr-pour and not a screen of its own. */
const SCREENS = [
  ['home', 'renderHome', 'scr-home'],
  ['shelf', 'renderShelf', 'scr-shelf'],
  ['flights', 'renderFlights', 'scr-flights'],
  ['pour', 'renderReels', 'scr-pour'],
  ['log', 'renderReels', 'scr-pour', 'history'],
  ['map', 'renderMap', 'scr-map'],
  ['info', 'renderReference', 'scr-ref'],
  ['settings', 'renderSettings', 'scr-settings'],
  ['library', 'renderLibraryScreen', 'scr-library']
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: PHONE, deviceScaleFactor: 2 });
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));
  /* The SDK, answered here and signed out — see fake-sdk.js. */
  await require('./fake-sdk.js').offline(p);
  await p.route('http://app.local/**', r => {
    const n = r.request().url().split('app.local/')[1].split('?')[0]
      || 'index.html';
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const t = n.endsWith('.json') ? 'application/json'
      : n.endsWith('.js') ? 'text/javascript'
      : n.endsWith('.png') ? 'image/png' : 'text/html';
    r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
  });
  await p.goto('http://app.local/index.html');
  await p.waitForTimeout(1200);
  const eng = require('./engine.js');
  const shelf = eng.shelf(dir);
    /* THROUGH THE ONE SHELF LOADER (2026-11-02). Nine harnesses set
       S.bottles and S.custom by hand and none of them joined the shared
       library, so each graded his real shelf against a catalogue of 322
       entries in which 53 of his 356 owned bottlings did not exist.
       eng.loadShelf is the door, and it refuses a short catalogue. */
  await eng.loadShelf(p, shelf);
  await p.evaluate(() => {
    /* AND A LOG, because the cards that need one are otherwise never drawn and
       so are never measured: renderBuyVsDrink returns early without pours, and
       both faults BZ found by eye on 2026-10-03 - a card inside a card, and a
       label clipped to "BOUGH AGAI" - were in that card. His own log is in his
       account rather than this repo, and the card's LAYOUT does not depend on
       which whiskies were poured, only on there being pours. One to four pours
       of each of thirty owned keys fills all four quadrants. */
    const keys = Object.keys(L.ownedCounts(S.bottles)).slice(0, 30);
    S.history = keys.map((k, i) => ({ at: Date.now() - i * 86400000,
      pours: new Array((i % 4) + 1).fill(k) }));
    save_();
  });

  /* WHAT A PHONE ACTUALLY SHOWS. Measured per screen, because a page that
     scrolls sideways does it on one screen and not the others. */
  const measure = () => p.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    const wide = [];
    const on = document.querySelector('.screen.on');
    if (!on) return { noScreen: true };
    on.querySelectorAll('*').forEach(n => {
      if (!(n.scrollWidth > n.clientWidth + 2 && n.clientWidth > 0)) return;
      /* A DRAWING IS NOT A PARAGRAPH. An SVG's own width bears no relation
         to the text inside it, and asking reports every chart label on the
         Home screen as overflowing something. */
      if (n.ownerSVGElement || n.tagName === 'svg') return;
      const s = getComputedStyle(n);
      /* A box that says it scrolls is MEANT to be wider than its frame -
         a table, a chart, a code block. That is the fix, not the fault. */
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') return;
      /* AND SO IS A LINE THAT SAYS IT TRUNCATES. A long bottle name cut
         off with an ellipsis is the design: the shelf has three hundred of
         them and they are meant to sit on one line. What is NOT the design
         is text that simply stops, with nothing to say it was cut - which
         is what a squashed column looks like. */
      if (s.textOverflow === 'ellipsis') return;
      const txt = (n.textContent || '').trim().slice(0, 50);
      if (!txt) return;
      wide.push(String(n.className || n.tagName) + ' (' + n.clientWidth
        + 'px holds ' + n.scrollWidth + 'px): ' + txt);
    });
    /* A CARD INSIDE A CARD, and cards that do not share a gutter. Neither
       overflows anything, so the measurement above cannot see either: a nested
       card is a correctly laid out card in the wrong place (2026-10-03). */
    const nested = [...on.querySelectorAll('.sheet .sheet')]
      .map(n => (n.className || '') + ': '
        + (n.textContent || '').trim().slice(0, 40));
    const edges = {};
    on.querySelectorAll('.sheet').forEach(c => {
      /* A card inside another is reported above; counting its gutter too
         would say the same fault twice. */
      if (c.parentElement && c.parentElement.closest('.sheet')) return;
      const x = Math.round(c.getBoundingClientRect().left);
      (edges[x] = edges[x] || []).push((c.textContent || '').trim().slice(0, 30));
    });
    /* A TAB PARKED OUTSIDE ITS OWN STRIP.
       The measurement above EXCUSES any box that says it scrolls - "that
       is the fix, not the fault" - and for a table, a chart or a code
       block that is right. It was wrong for the Settings tab strip, which
       hides its scrollbar: Help and About sat 11px inside a 358px strip,
       holding the only way to the log, and nothing said so because the
       strip declared overflow-x:auto and was excused (2026-11-02).

       IT ASKS ABOUT A TABLIST AND NOTHING ELSE, which is the difference
       between the two things that look alike. A tablist is a FIXED, SMALL
       set of destinations and every one of them should be visible without
       discovering a swipe nothing hints at. The map's region chips are a
       carousel - The world, US, Kentucky, Bardstown, and as many more as
       the shelf has - where scrolling is the only possible design and the
       next chip peeking at the edge is the invitation. Written as geometry
       instead of role, this flagged that carousel too, which would have
       taught somebody to ignore it.

       Half a tab showing is the line: a tab peeking is an invitation, a
       tab entirely gone is a destination nobody can see. */
    const parked = [];
    on.querySelectorAll('[role="tablist"]').forEach(n => {
      const box = n.getBoundingClientRect();
      if (box.width < 2) return;
      n.querySelectorAll('button, a, [role="tab"]').forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.width < 2) return;
        const shown = Math.max(0,
          Math.min(r.right, box.right) - Math.max(r.left, box.left));
        if (shown >= r.width / 2) return;
        parked.push(String(n.className || n.tagName).slice(0, 24)
          + ' parks "' + (c.textContent || '').trim().slice(0, 28)
          + '" (' + Math.round(shown) + ' of ' + Math.round(r.width)
          + 'px showing)');
      });
    });
    /* A TARGET A THUMB MISSES. Apple's HIG asks 44x44pt and Android's
       Material asks 48x48dp, and both stores' reviewers measure it - so a
       control under 44px is not a style complaint, it is a rejection.
       Fifty-nine of them were under it on 2026-11-02, the shelf's category
       bars at 28px tall and a map pin at 14px across, and nothing in
       nineteen checks asked. It lives HERE rather than in a harness of its
       own because this file already boots every screen at 390px with the
       real shelf, which is the whole cost of asking.

       THE NAV IS MEASURED WITH WHATEVER SCREEN IS ON. It is fixed and sits
       outside .screen, so on.querySelectorAll cannot see it, and it holds
       the eight controls every other screen is reached through. */
    const MINTAP = 44;
    const small = [];
    const tappable = n => {
      const t = n.tagName;
      if (t === 'BUTTON' || t === 'SELECT' || t === 'TEXTAREA') return true;
      if (t === 'A' && n.getAttribute('href')) return true;
      if (t === 'INPUT' && n.type !== 'hidden') return true;
      const role = n.getAttribute('role');
      if (role === 'button' || role === 'tab') return true;
      if (n.onclick) return true;
      return getComputedStyle(n).cursor === 'pointer';
    };
    const outer = [];
    [...on.querySelectorAll('*'),
      ...document.querySelectorAll('nav *, .nav *')].forEach(n => {
      if (!tappable(n)) return;
      const r = n.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none') return;
      /* A CONTROL INSIDE A CONTROL IS ONE TARGET. The outer box is what a
         thumb hits, so a 12px icon inside a 48px button is not a finding. */
      if (outer.some(q => q.contains(n))) return;
      outer.push(n);
      /* A MAP PIN CANNOT PROMISE A FLAT 44px AND IT IS CHECKED BELOW.
         Giving every pin the full 44 made the map worse, not better:
         Scotland holds 82 bottles and sits 8px from Ireland at world zoom,
         so two 44px circles hand that whole corner to whichever was drawn
         last. L.tapRadius is the rule and \u00a7503 tests the arithmetic;
         `pins` below tests that each pin actually got it. */
      if (n.classList && n.classList.contains('pin')) return;
      /* A HAIR'S TOLERANCE, NOT A ROUNDING. A browser lays out in
         fractions and a box of 43.99px is a 44px control. Rounding to the
         nearest integer excuses anything from 43.5 up, which is not a
         rounding error - it is half a pixel of real shortfall, and it hid
         the map's 43.6px "US" chip here while the cloud, rounding the same
         boundary the other way, failed the build (2026-11-02). */
      if (r.width > MINTAP - 0.1 && r.height > MINTAP - 0.1) return;
      /* AN INLINE LINK IN A SENTENCE IS NOT A BUTTON. It is as tall as its
         line, which is what a link in prose is; the guideline is about
         controls you aim at. */
      if (n.tagName === 'A' && s.display === 'inline') return;
      /* ONE DECIMAL, BECAUSE THE COMPARISON HAS ONE. Rounded to whole
         pixels this printed `chip is 44x44px` under a heading that said
         "under 44px", which reads as a broken check rather than a 43.6px
         control. A measurement reports what it measured. */
      const px = v => (Math.round(v * 10) / 10);
      small.push(String(n.className || n.tagName).slice(0, 30) + ' is '
        + px(r.width) + 'x' + px(r.height) + 'px: "'
        + (n.textContent || n.getAttribute('aria-label') || '')
          .trim().slice(0, 28) + '"');
    });
    /* EVERY PIN HAS A TARGET, AND IT IS AS BIG AS THE MAP ALLOWS. Three
       things can go wrong and each is worth catching: a pin with no hit
       circle at all (the dot's 10px is then the target), a target smaller
       than the dot you can see (a dead ring round the edge), and a target
       that did not take the room it had. */
    const pins = [];
    if (on.id === 'scr-map') {
      const svg = on.querySelector('#map');
      const perPx = svg
        ? svg.viewBox.baseVal.width / (svg.clientWidth || 360) : 0;
      on.querySelectorAll('#map .pin').forEach(g => {
        const name = (g.querySelector('text') || {}).textContent || '?';
        const dot = g.querySelector('circle');
        const hit = g.querySelector('.hit');
        if (!hit) return pins.push(name + ' has no target circle at all');
        const hr = hit.r.baseVal.value, dr = dot ? dot.r.baseVal.value : 0;
        if (hr < dr - 1e-6) {
          return pins.push(name + ' has a target inside its own dot ('
            + Math.round(hr / perPx) + 'px round a '
            + Math.round(dr / perPx) + 'px dot)');
        }
        const allowed = Math.max(dr,
          Math.min(22 * perPx, (+g.dataset.gap || Infinity) / 2));
        if (hr < allowed - 1e-6) {
          pins.push(name + ' takes ' + Math.round(hr / perPx)
            + 'px where ' + Math.round(allowed / perPx) + 'px was free');
        }
      });
    }
    return { page: doc.scrollWidth, view: window.innerWidth,
      pins: pins.slice(0, 6),
      small: small.slice(0, 6), smallN: small.length,
      nested: nested.slice(0, 4), edges: edges,
      parked: parked.slice(0, 6),
      wide: wide.slice(0, 6) };
  });

  for (const [name, fn, id, where] of SCREENS) {
    const drew = await p.evaluate(([f, scrId, wh]) => {
      if (typeof window[f] !== 'function') return 'MISSING ' + f;
      document.querySelectorAll('.screen').forEach(s =>
        s.classList.remove('on'));
      /* NO FALLBACK. A name that matches no element is the fault, not a
         reason to photograph whatever was left on screen. */
      const scr = document.getElementById(scrId);
      if (!scr) return 'NO SCREEN ' + scrId;
      scr.classList.add('on');
      if (wh && typeof POUR === 'object') POUR.where = wh;
      try { window[f](); } catch (e) { return 'THREW ' + e.message; }
      /* AND IT MUST HAVE DRAWN SOMETHING. A screen switched on and left
         empty is what the two wrong ids produced, and an empty box passes
         every measurement below. */
      if (!scr.innerText.trim()) return 'DREW NOTHING into ' + scrId;
      return 'ok';
    }, [fn, id, where]);
    if (drew !== 'ok') { bad(name + ' did not draw', drew); continue; }
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    const m = await measure();
    if (m.page > m.view + 1) {
      bad(name + ' scrolls sideways on a phone',
        m.page + 'px of page in a ' + m.view + 'px screen\n'
        + m.wide.join('\n'));
    } else if (m.wide.length) {
      bad(name + ' has text wider than the box it sits in',
        m.wide.join('\n'));
    } else {
      ok(name + ' fits a ' + m.view + 'px phone');
    }

    /* A CARD INSIDE A CARD. Neither card overflows anything, so the measurement
       above cannot see it - it is a correctly laid out card in the wrong place,
       drawing a second border and a second gutter around the one inside it
       (BZ, 2026-10-03, from a screenshot of the Shelf). */
    /* A CONTROL NOBODY CAN SEE IS A DESTINATION NOBODY CAN REACH. */
    if (m.parked.length) {
      bad(name + ' leaves no control parked out of sight',
        m.parked.join(String.fromCharCode(10)));
    } else {
      ok(name + ' leaves no control parked out of sight');
    }

    /* 44px IS THE LINE, not 48. Every standard control in this app is 44
       or 46 (measured 2026-11-02), so Material's 48 would be a uniform 4px
       on every button in the file - a layout decision, not a fix, and BZ's
       to make. Apple's 44 is the one a reviewer enforces. */
    if (m.smallN) {
      bad(name + ' has ' + m.smallN + ' control(s) under 44px',
        m.small.join(String.fromCharCode(10)));
    } else {
      ok(name + ' puts every control within a thumb');
    }

    if (m.pins && m.pins.length) {
      bad(name + ' gives every pin the biggest target it can',
        m.pins.join(String.fromCharCode(10)));
    } else if (name === 'map') {
      ok(name + ' gives every pin the biggest target it can');
    }

    if (m.nested.length) {
      bad(name + ' draws no card inside another card',
        m.nested.join('\n'));
    } else {
      ok(name + ' draws no card inside another card');
    }

    /* AND THE CARDS SHARE A GUTTER. Two distances from the edge means one of
       them is wrong, and the count says which. */
    const lefts = Object.keys(m.edges);
    if (lefts.length > 1) {
      bad(name + ' sets every card on one gutter',
        lefts.map(x => x + 'px: ' + m.edges[x].length + ' card(s) — '
          + m.edges[x][0]).join('\n'));
    } else if (lefts.length) {
      ok(name + ' sets every card on one gutter (' + lefts[0] + 'px)');
    }
  }

  if (threw.length) bad('the page threw while drawing', threw.join('\n'));
  await b.close();
  console.log('\n  ' + SCREENS.length + ' screenshots in shots/');
  console.log(fails ? '✖ ' + fails + ' of ' + checks + ' phone checks '
    + 'found something' : '✓ all ' + checks + ' phone checks pass');
  process.exit(fails ? 1 : 0);
})();
