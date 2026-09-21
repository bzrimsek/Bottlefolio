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
    return { page: doc.scrollWidth, view: window.innerWidth,
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
  }

  if (threw.length) bad('the page threw while drawing', threw.join('\n'));
  await b.close();
  console.log('\n  ' + SCREENS.length + ' screenshots in shots/');
  console.log(fails ? '✖ ' + fails + ' of ' + checks + ' phone checks '
    + 'found something' : '✓ all ' + checks + ' phone checks pass');
  process.exit(fails ? 1 : 0);
})();
