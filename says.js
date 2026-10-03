/* WHAT EVERY SCREEN SAYS, read on BZ's real shelf.
 *
 *   node says.js
 *
 * WHY. Fifteen checks prove the code runs; answers.js reads the sentences one
 * planning answer makes. Nothing read the ORDINARY screens, and on 2026-10-03
 * BZ opened Shop and it told him he owned 7 bottles. He has 352. Every check was
 * green, because every check was green about the code and this was a sentence.
 *
 * The three faults that round turned up are the three this looks for, and each
 * was invisible to everything else:
 *
 *   A COUNT THAT CONTRADICTS THE SHELF. Shop's 7 for 352, and four screens
 *   calling 352 bottlings "352 whiskies" when thirteen of them are the bar shelf.
 *
 *   A NUMBER WITH NOTHING TO SAY WHAT IT COUNTS. The Shelf drew a bar reading
 *   just "7": seven uncategorised bottles whose label came back an empty string.
 *
 *   AN EMPTY STATE OVER A FULL SHELF. "Not enough shelf yet", "Add bottles
 *   first", "Nothing here" - said to a man with three hundred and fifty of them.
 *   This is the fault class that keeps coming back, because the code is running
 *   perfectly when it happens.
 *
 * It drives the REAL shelf, not a fixture: these faults are about volume and a
 * fixture of four bottles has none.
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const dir = __dirname;

let fails = 0, checks = 0;
function ok(w) { checks++; console.log('  ✓ ' + w); }
function bad(w, d) {
  checks++; fails++;
  console.log('  ✖ ' + w);
  if (d) String(d).split('\n').slice(0, 6).forEach(l => console.log('      ' + l));
}

/* EVERY SCREEN A PERSON CAN REACH, and the Shop modes, which are four screens
   wearing one name. Each navigates as well as drawing: rendering without
   navigating reads whatever was on top before, which cost a round of its own. */
/* DRIVEN THE WAY THE NAV BUTTON DRIVES THEM. TAB_RENDER is the app's own table
   of what a tab redraws, and the first version of this check called one render
   function per screen instead - which is not what a tap does. It reported the
   Taste screen as saying "Add bottles first" over 352 open bottles, because
   renderReels alone leaves the glasses as they were, while tapping the tab calls
   renderPayline too. A check that drives something the app never drives is a
   check that reports faults nobody has. */
const STOPS = [
  ['Home', "goTo('home'); TAB_RENDER.home();"],
  ['Shelf', "goTo('shelf'); TAB_RENDER.shelf();"],
  ['Shelf, as a list', "S.shelfSub = 'all'; goTo('shelf'); TAB_RENDER.shelf();"],
  ['Taste', "goTo('pour'); TAB_RENDER.pour();"],
  ['Flights', "goTo('flights'); TAB_RENDER.flights();"],
  ['Buddies', "goTo('buddies'); TAB_RENDER.buddies();"],
  ['The map', "goTo('map'); renderMap();"],
  ['Learn', "goTo('ref'); TAB_RENDER.ref();"],
  ['Shop, asking', "S.shopMode = null; goTo('shop'); TAB_RENDER.shop();"],
  ['Shop, planning', "S.shopMode = 'plan'; S.shopDim = null; goTo('shop'); TAB_RENDER.shop();"],
  ['Shop, in a store', "S.shopMode = 'store'; goTo('shop'); TAB_RENDER.shop();"],
  ['Settings', "goTo('settings'); renderSettings();"]
];

/* WHAT A FULL SHELF MUST NEVER BE TOLD. Each is a sentence this app says when it
   believes there is nothing there, and every one of them has been shown to BZ
   over three hundred and fifty bottles at least once. */
const EMPTY_SAYS = [
  /not enough shelf/i,
  /add bottles first/i,
  /add some bottles/i,
  /\badd a few more\b/i,
  /nothing to compare yet/i,
  /there is nothing here/i,
  /start by adding/i
];

/* A SCREEN MAY SAY ONE OF THOSE ABOUT A PART OF ITSELF. The wishlist is empty
   because nothing has been put on it, and the taste questions are unanswered
   because nobody answered them - neither is a claim about the shelf. Named one
   by one, so a new empty state is caught rather than waved through. */
const FAIR = [
  /nothing on it yet/i,          // the wishlist
  /nobody is sharing one/i,      // no buddy shelves
  /0 answered so far/i,          // the taste questions
  /sign in/i                     // signed out, which the harness is
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 2600 } });
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));
  await p.route('http://app.local/**', r => {
    const n = r.request().url().split('app.local/')[1].split('?')[0] || 'index.html';
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const t = n.endsWith('.json') ? 'application/json'
      : n.endsWith('.js') ? 'text/javascript'
      : n.endsWith('.png') ? 'image/png' : 'text/html';
    r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
  });
  await p.goto('http://app.local/index.html');
  await p.waitForTimeout(1200);

  const { bottles: bots, custom, flights } = require('./engine.js').shelf(dir);
  await p.evaluate(([bs, cu, fl]) => {
    S.bottles = bs; S.custom = cu; S.customFlights = fl || [];
    save_(); rebuildCatalog();
  }, [bots, custom, flights]);

  /* THE TRUTH, ASKED OF THE ENGINE, which is what every sentence below is
     graded against. */
  const T = await p.evaluate(() => ({
    rows: S.bottles.length,
    ownedRows: S.bottles.filter(L.isOwned).length,
    bottlings: Object.keys(L.ownedCounts(S.bottles)).length,
    whiskies: L.ownedWhiskies(S.catalog, S.bottles).length
  }));
  console.log('  on ' + T.ownedRows + ' owned bottles, ' + T.bottlings
    + ' bottlings, ' + T.whiskies + ' whiskies');
  if (T.whiskies < 50) {
    bad('the real shelf is loaded', 'only ' + T.whiskies + ' whiskies - '
      + 'this check is about volume and proves nothing on a small shelf');
  } else {
    ok('the real shelf is loaded, and it is big enough to be worth reading');
  }

  for (const [name, js] of STOPS) {
    const before = threw.length;
    let seen;
    try {
      await p.evaluate(new Function(js));
      await p.waitForTimeout(400);
      seen = await p.evaluate(() => {
        const on = document.querySelector('.screen.on') || document.body;
        return {
          text: on.innerText,
          /* EVERY BAR AND ROW THAT CARRIES A NUMBER, with whatever names it. */
          bars: [...on.querySelectorAll('.bar')].map(x => ({
            label: (x.querySelector('.t') || {}).textContent || '',
            all: x.innerText.replace(/\n/g, ' ').trim()
          }))
        };
      });
    } catch (e) {
      bad(name + ' draws', e.message);
      continue;
    }
    if (threw.length > before) {
      bad(name + ' draws without throwing', threw.slice(before).join(' | '));
      continue;
    }

    /* 1. NO EMPTY STATE OVER A FULL SHELF. */
    const lines = seen.text.split('\n').map(x => x.trim()).filter(Boolean);
    const wrong = lines.filter(l => EMPTY_SAYS.some(re => re.test(l))
      && !FAIR.some(re => re.test(l)));
    if (wrong.length) {
      bad(name + ' does not say the shelf is empty',
        wrong.slice(0, 3).join('\n'));
    } else {
      ok(name + ' does not say the shelf is empty');
    }

    /* 2. A COUNT OF WHISKIES IS THE WHISKY COUNT. The bar shelf is inventory:
       rum, vodka and gin are bottles and are not whiskies, and four screens
       called the bottling count whiskies until 2026-10-03. */
    const said = [...seen.text.matchAll(/(\d[\d,]*)\s+whisk(?:y|ies)\b/gi)]
      .map(m => Number(m[1].replace(/,/g, '')))
      /* A small number is a slice - a filter, a house, a flight - and this is
         about the whole-shelf claims, which are the ones that were wrong. */
      .filter(n => n > T.whiskies * 0.5);
    const offBy = said.filter(n => n !== T.whiskies);
    if (offBy.length) {
      bad(name + ' counts whiskies, not bottlings',
        'says ' + offBy.join(', ') + ' where the shelf holds ' + T.whiskies
        + ' whiskies (' + T.bottlings + ' bottlings)');
    } else {
      ok(name + ' counts whiskies, not bottlings');
    }

    /* 3. NO NUMBER WITHOUT SOMETHING TO SAY WHAT IT COUNTS. */
    const nameless = seen.bars.filter(x => !String(x.label).trim());
    if (nameless.length) {
      bad(name + ' names every number it draws',
        nameless.slice(0, 3).map(x => '"' + x.all + '"').join('\n'));
    } else {
      ok(name + ' names every number it draws');
    }
  }

  await b.close();
  console.log('\n  ' + (fails ? '✖ ' + fails + ' of ' + checks
    + ' failed' : '✓ all ' + checks + ' pass'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  ✖ the reader threw: ' + e.message); process.exit(1); });
