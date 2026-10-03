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

const SCREENS = [
  ['home', 'renderHome'], ['shelf', 'renderShelf'], ['flights', 'renderFlights'],
  ['pour', 'renderReels'], ['log', 'renderHistory'], ['map', 'renderMap'],
  ['info', 'renderReference'], ['settings', 'renderSettings'],
  ['library', 'renderLibraryScreen']
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: PHONE, deviceScaleFactor: 2 });
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));
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
  const { bottles: bots, custom } = require('./engine.js').shelf(dir);
  await p.evaluate(([bs, cu]) => {
    S.bottles = bs; S.custom = cu; save_(); rebuildCatalog();
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
  }, [bots, custom]);

  /* WHAT A PHONE ACTUALLY SHOWS. Measured per screen, because a page that
     scrolls sideways does it on one screen and not the others. */
  const measure = () => p.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    const wide = [];
    const on = document.querySelector('.screen.on') || document.body;
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
    return { page: doc.scrollWidth, view: window.innerWidth,
      nested: nested.slice(0, 4), edges: edges,
      wide: wide.slice(0, 6) };
  });

  for (const [name, fn] of SCREENS) {
    const drew = await p.evaluate(f => {
      if (typeof window[f] !== 'function') return 'MISSING ' + f;
      document.querySelectorAll('.screen').forEach(s =>
        s.classList.remove('on'));
      const id = { renderHome: 'scr-home', renderShelf: 'scr-shelf',
        renderFlights: 'scr-flights', renderReels: 'scr-pour',
        renderHistory: 'scr-log', renderMap: 'scr-map',
        renderReference: 'scr-info', renderSettings: 'scr-settings',
        renderLibraryScreen: 'scr-library' }[f];
      const scr = id && document.getElementById(id);
      if (scr) scr.classList.add('on');
      try { window[f](); } catch (e) { return 'THREW ' + e.message; }
      return 'ok';
    }, fn);
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
