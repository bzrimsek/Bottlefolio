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
/* EVERY TAB THE NAV CAN REACH, and then the screens behind them.

   This list held nine screens and the nav holds eight tabs, which sounds
   like plenty until you line them up: shop, buddies and guide were in
   neither this file nor any other phone-size measurement. Buddies is where
   a tab sat cut in half at the edge of the glass, reported over and over,
   while this harness printed green for the quarter of the app it could
   see. A measurement that covers some screens is not a smaller version of
   one that covers all of them - it is a guarantee about a place nobody was
   looking for faults anyway.

   The check below reads TAB_RENDER out of the running app and fails if a
   tab is not in here, so the next screen added cannot go unphotographed
   the way these three did. */
const SCREENS = [
  ['home', 'renderHome', 'scr-home'],
  ['shelf', 'renderShelf', 'scr-shelf'],
  ['shop', 'renderShop', 'scr-shop'],
  ['pour', 'renderReels', 'scr-pour'],
  ['buddies', 'renderBuddiesTab', 'scr-buddies'],
  ['flights', 'renderFlights', 'scr-flights'],
  ['guide', 'renderGuide', 'scr-guide'],
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
    /* A TAB NOBODY CAN SEE, and the two holes that let one through.

       This descended from [role="tablist"] - a role index.html has never
       used once - so the selector matched nothing on all 38 screens and
       printed 38 ticks for a measurement it never took. A tab cut in half
       at the edge of the phone was reported, fixed, and back again,
       because nothing was ever holding it.

       The second hole is what it clipped against. A tab was compared to
       its own strip's box, and a strip that is itself wider than the phone
       contains every one of its tabs perfectly while every one of them
       sits off the glass. It clips against the SCREEN now, and against any
       box between the tab and the screen that actually hides overflow.

       And any clipping at all is the finding. Half a tab showing is the
       exact thing that was reported. */
    const parked = [];
    let tabsSeen = 0;
    on.querySelectorAll('[role="tab"], .ftab, .tabrow .tab').forEach(c => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      if (r.width < 2 || cs.visibility === 'hidden') return;
      tabsSeen++;
      let left = 0, right = window.innerWidth;
      for (let a = c.parentElement; a; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (as.overflowX === 'visible' && as.overflowY === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (ar.width < 2) continue;
        left = Math.max(left, ar.left);
        right = Math.min(right, ar.right);
      }
      const shown = Math.max(0,
        Math.min(r.right, right) - Math.max(r.left, left));
      if (shown >= r.width - 0.5) return;
      parked.push(String(c.className || c.tagName).slice(0, 24)
        + ' shows ' + Math.round(shown) + ' of ' + Math.round(r.width)
        + 'px of "' + (c.textContent || '').trim().slice(0, 24) + '"');
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
    /* Controls whose geometry carries the datum, gathered here and measured
       against their own rule below rather than against the flat 44. */
    const geom = [], bars = [], spines = [];
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
      /* TWO MORE CONTROLS CARRY THEIR DATUM IN THEIR GEOMETRY, and for both
         a flat 44 cost the drawing and bought nothing a thumb can feel.
         Each is measured against its own rule below instead of being waved
         through - an exemption with no measurement behind it is a hole.

         A BOOK SPINE'S WIDTH IS ITS COUNT, the way a pin's radius is.
         Padding its slot to 44 turned a shelf of books into a row of books
         with gaps and wrapped a third row; the spine stands 170px tall, so
         its target is a thumb's width by four times it.

         A BAR'S ROWS TOUCH, so every pixel from one label to the next is
         already part of a target - which is the 24x24 WCAG 2.5.8 asks for.
         Raising them to 44 cost one screen eighteen rows at 16px each. */
      if (n.classList && n.classList.contains('bar')) { bars.push(n); return; }
      if (n.parentElement && n.parentElement.classList
          && n.parentElement.classList.contains('books')) {
        spines.push(n); return;
      }
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
    /* AND NOW THE RULE EACH OF THEM OWES. Waving a control through without
       measuring it is how an exemption becomes a hole.

       A BAR owes 24px and rows that touch. The touching is the half that
       makes 24 enough, so it is checked and not assumed: a gap between
       rows turns a 28px row into a 28px target with dead pixels round it.

       A BOOK SLOT owes 44px in its long direction - it is the full shelf
       row, so this is a floor it clears by four times - and it owes being
       exactly as wide as the book standing in it. That second one is the
       guard that was missing: padding the slot wider than its book is what
       spread the shelf apart and wrapped a row, and nothing could see it. */
    bars.forEach(b => {
      const r = b.getBoundingClientRect();
      if (r.height < 24 - 0.1) {
        geom.push('a bar row is ' + Math.round(r.height * 10) / 10
          + 'px where 24 is the floor');
      }
      const rows = b.parentElement;
      if (rows && rows.classList.contains('bars')) {
        const g = parseFloat(getComputedStyle(rows).rowGap) || 0;
        if (g > 0.1) {
          geom.push('bar rows sit ' + g + 'px apart, so they do not touch');
        }
      }
    });
    spines.forEach(slot => {
      const r = slot.getBoundingClientRect();
      if (r.height < MINTAP - 0.1) {
        geom.push('a book slot is ' + Math.round(r.height * 10) / 10
          + 'px tall where 44 is the floor');
      }
      const bk = slot.querySelector('.bk');
      if (!bk) return;
      const br = bk.getBoundingClientRect();
      if (r.width - br.width > 0.6) {
        geom.push('a book slot is ' + Math.round(r.width * 10) / 10
          + 'px round a ' + Math.round(br.width * 10) / 10
          + 'px book, so the shelf draws a gap');
      }
    });
    /* WHAT THE SCREEN ACTUALLY SETS IN TYPE. Two faces are loaded and the
       stylesheet holds five sizes, which sounds disciplined until you
       photograph one screen and count what a reader meets on it: a card
       sub-line at 16px beside a masthead sub-line at 12px doing the same
       job, headings at three sizes, a number in the display face inside a
       card whose every other word is the body face. "Too many fonts" was
       never about how many are loaded.

       Every element holding its own words, grouped by face+size+weight and
       by how many of them there are. Reported rather than failed until the
       budget below is set from real numbers. */
    const typeSeen = {}, typeWho = {};
    on.querySelectorAll('*').forEach(n => {
      let own = '';
      for (const k of n.childNodes) {
        if (k.nodeType === 3) own += k.nodeValue;
      }
      if (!own.trim()) return;
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '');
      const key = fam + ' ' + Math.round(parseFloat(cs.fontSize) * 10) / 10
        + 'px/' + cs.fontWeight;
      typeSeen[key] = (typeSeen[key] || 0) + 1;
      /* WHO SET IT. A setting used once on a screen is almost always drift
         rather than a decision, and naming the element is the difference
         between "nine is too many" and something anybody can go and fix. */
      if (!typeWho[key]) {
        typeWho[key] = (String(n.className || n.tagName).slice(0, 22)
          + ' "' + own.trim().slice(0, 18) + '"');
      }
    });
    const type = Object.keys(typeSeen).sort(
      (a, b) => typeSeen[b] - typeSeen[a]).map(k => k + ' x' + typeSeen[k]
        + (typeSeen[k] === 1 ? '  <- once only: ' + typeWho[k] : ''));

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
      parked: parked.slice(0, 6), tabs: tabsSeen, type: type,
      geom: geom.slice(0, 6), geomN: geom.length,
      wide: wide.slice(0, 6) };
  });

  /* THE APP'S OWN LIST IS THE SOURCE. TAB_RENDER is what the nav drives,
     so a tab in it and not in SCREENS is a screen no phone-size
     measurement has ever seen - which is how shop, buddies and guide went
     unphotographed while this file reported all green. */
  const uncovered = await p.evaluate(covered => {
    if (typeof TAB_RENDER !== 'object') return 'NO TAB_RENDER';
    return Object.keys(TAB_RENDER).filter(k => covered.indexOf('scr-' + k) < 0);
  }, SCREENS.map(s => s[2]));
  if (uncovered === 'NO TAB_RENDER') {
    bad('the tab list', 'TAB_RENDER is not in the page - this check is blind');
  } else if (uncovered.length) {
    bad(uncovered.length + ' tab(s) are photographed by nothing',
      uncovered.join(', '));
  } else {
    ok('every tab the nav reaches is photographed');
  }

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
    /* A COUNT, NOT A TICK. The old line said "leaves no control parked out
       of sight" on every screen including the ones with no tabs at all,
       which is how a selector that matched nothing looked like 38 passes.
       It now says how many it measured, and says nothing where there was
       nothing to measure. */
    if (m.parked.length) {
      bad(name + ' hides ' + m.parked.length + ' of its ' + m.tabs
        + ' tabs off the screen', m.parked.join(String.fromCharCode(10)));
    } else if (m.tabs) {
      ok(name + ' shows all ' + m.tabs + ' of its tabs');
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

    if (process.env.TYPE) {
      console.log('  [type] ' + name + ': ' + m.type.length + ' settings');
      m.type.forEach(t => console.log('        ' + t));
    }
    /* A CEILING THAT ONLY EVER COMES DOWN. "Lots of fonts" and "too many
       sizes" were reported screen by screen for as long as nothing counted
       them; two faces are loaded and the stylesheet holds five sizes, so
       the number a reader actually meets was nobody's number. Measured at
       390px on the real shelf, the worst screen was ten. It is eight now,
       and best practice is nearer six,
       and this holds the line: raise it and the reports come back.

       A setting is one face at one size at one weight. The bookshelf's
       spine labels count, and should - a drawing made of type is still
       type a reader meets. */
    const TYPE_CAP = 8;
    if (m.type.length > TYPE_CAP) {
      bad(name + ' sets type ' + m.type.length + ' different ways, over '
        + TYPE_CAP, m.type.join(String.fromCharCode(10)));
    }

    if (m.geomN) {
      bad(name + ' has ' + m.geomN + ' control(s) breaking their own rule',
        m.geom.join(String.fromCharCode(10)));
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
