/* WHAT EVERY SCREEN SAYS, on three shelves.
 *
 *   node says.js
 *
 * WHY. Fifteen checks prove the code runs; answers.js reads the sentences one
 * planning answer makes. Nothing read the ORDINARY screens, and on 2026-10-03
 * BZ opened Shop and it told him he owned 7 bottles. He has 352. Every check was
 * green, because every check was green about the code and this was a sentence.
 *
 * FOUR RULES, each of which let a fault through to him this week:
 *
 *   A COUNT THAT CONTRADICTS THE SHELF. Shop's 7 for 352, and four screens
 *   calling 352 bottlings "352 whiskies" when thirteen are the bar shelf.
 *
 *   ONE QUANTITY SAID TWO WAYS. The Shelf summary said 133 bourbons and the
 *   chart beside it said 132, because one of them dropped a product with no
 *   key. Both were "a bourbon count", so grading each against the engine
 *   separately would not have caught it: what catches it is noticing that one
 *   label carries two values.
 *
 *   A NUMBER WITH NOTHING TO SAY WHAT IT COUNTS. The Shelf drew a bar reading
 *   just "7": seven uncategorised bottles whose label came back empty.
 *
 *   AN EMPTY STATE AT THE WRONG END. "Not enough shelf yet", "Add bottles
 *   first" - said to a man with three hundred and fifty of them. The mirror
 *   is worse and was never checked at all: a brand-new user being told what
 *   their shelf leans to, or a count of somebody else's bottles.
 *
 * SO IT RUNS THREE SHELVES: BZ's real one, a shelf of three, and an empty one.
 * The faults are about volume, and a fixture of four bottles has none of them -
 * but an empty-state sentence is only right at one end, and until today nothing
 * drew every screen at the other.
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

/* WHAT A FULL SHELF MUST NEVER BE TOLD, and what an empty one must never be
   told it HAS. Each is a sentence this app says when it believes there is
   nothing there, and every one has been shown to BZ over three hundred and
   fifty bottles at least once. */
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

/* THE THREE SHELVES. `floor` is the size below which an empty state is the
   RIGHT answer rather than a fault - the app's own planning floor is twelve. */
const SHELVES = [
  { say: 'the real shelf', take: b => b, empty: false },
  { say: 'a shelf of three', take: b => b.slice(0, 3), empty: true },
  { say: 'a new shelf', take: () => [], empty: true }
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

  const { bottles: all, custom, flights } = require('./engine.js').shelf(dir);

  for (const shelf of SHELVES) {
    const bots = shelf.take(all);
    await p.evaluate(([bs, cu, fl]) => {
      S.bottles = bs; S.custom = cu; S.customFlights = fl || [];
      S.shelfSub = null; S.filters = S.filters || {};
      save_(); rebuildCatalog();
    }, [bots, custom, flights]);

    /* THE TRUTH FOR THIS SHELF, asked of the engine, which is what every
       sentence below is graded against. */
    const T = await p.evaluate(() => ({
      ownedRows: S.bottles.filter(L.isOwned).length,
      bottlings: Object.keys(L.ownedCounts(S.bottles)).length,
      whiskies: L.ownedWhiskies(S.catalog, S.bottles).length
    }));
    console.log('\n  -- ' + shelf.say + ': ' + T.ownedRows + ' owned bottles, '
      + T.bottlings + ' bottlings, ' + T.whiskies + ' whiskies');
    if (!shelf.empty && T.whiskies < 50) {
      bad('the real shelf is loaded', 'only ' + T.whiskies + ' whiskies - this '
        + 'check is about volume and proves nothing on a small shelf');
      continue;
    }

    /* EVERY LABELLED NUMBER ON EVERY SCREEN, gathered across the whole walk so
       one quantity said two ways can be seen. */
    const byLabel = {};

    for (const [name, js] of STOPS) {
      const where = shelf.say + ', ' + name;
      const before = threw.length;
      let seen;
      try {
        await p.evaluate(new Function(js));
        await p.waitForTimeout(350);
        seen = await p.evaluate(() => {
          const on = document.querySelector('.screen.on') || document.body;
          return {
            text: on.innerText,
            bars: [...on.querySelectorAll('.bar')].map(x => ({
              label: ((x.querySelector('.t') || {}).textContent || '').trim(),
              n: Number(((x.querySelector('.n') || {}).textContent || '')
                .replace(/[^\d.]/g, '')),
              all: x.innerText.replace(/\n/g, ' ').trim()
            }))
          };
        });
      } catch (e) { bad(where + ' draws', e.message); continue; }
      if (threw.length > before) {
        bad(where + ' draws without throwing', threw.slice(before).join(' | '));
        continue;
      }
      const lines = seen.text.split('\n').map(x => x.trim()).filter(Boolean);

      /* 1. AN EMPTY STATE BELONGS AT ONE END ONLY. On a full shelf it is a
         fault; on an empty one its ABSENCE is not checked here, because a
         screen may legitimately have nothing to say and say nothing. */
      if (!shelf.empty) {
        const wrong = lines.filter(l => EMPTY_SAYS.some(re => re.test(l))
          && !FAIR.some(re => re.test(l)));
        if (wrong.length) bad(where + ' does not say the shelf is empty',
          wrong.slice(0, 3).join('\n'));
        else ok(where + ' does not say the shelf is empty');
      }

      /* 2. A COUNT OF WHISKIES IS THE WHISKY COUNT, for THIS shelf - which on
         an empty one means no screen may claim any whiskies at all. */
      const said = [...seen.text.matchAll(/(\d[\d,]*)\s+whisk(?:y|ies)\b/gi)]
        .map(m => Number(m[1].replace(/,/g, '')))
        /* A small number is a slice - a filter, a house, a flight. On a full
           shelf only the whole-shelf claims are graded; on an empty one every
           number is a whole-shelf claim, because there is nothing to slice. */
        .filter(n => shelf.empty ? n > 0 : n > T.whiskies * 0.5);
      const offBy = said.filter(n => n !== T.whiskies);
      if (offBy.length) {
        /* NAMING THE ELEMENT, because "says 339" without saying where is a
           report somebody then has to go and reproduce. */
        const which = await p.evaluate(wrong2 => {
          const on = document.querySelector('.screen.on');
          const out = [];
          on.querySelectorAll('*').forEach(n => {
            if (n.children.length) return;
            const t = (n.textContent || '').trim();
            if (wrong2.some(v => t.indexOf(String(v)) >= 0)
                && /whisk/i.test(t)) {
              out.push((n.id || n.className || n.tagName) + ': '
                + t.slice(0, 70));
            }
          });
          return { on: on.id, found: out.slice(0, 4) };
        }, offBy);
        bad(where + ' counts whiskies, not bottlings',
          ['says ' + offBy.join(', ') + ' where this shelf holds '
            + T.whiskies + ' whiskies (' + T.bottlings + ' bottlings)',
           'on screen ' + which.on].concat(which.found).join('\n'));
      } else ok(where + ' counts whiskies, not bottlings');

      /* 3. NO NUMBER WITHOUT SOMETHING TO SAY WHAT IT COUNTS. */
      const nameless = seen.bars.filter(x => !x.label);
      if (nameless.length) {
        bad(where + ' names every number it draws',
          nameless.slice(0, 3).map(x => '"' + x.all + '"').join('\n'));
      } else ok(where + ' names every number it draws');

      /* 4. GATHERED, for the one-quantity-two-ways check below. */
      seen.bars.forEach(x => {
        if (!x.label || !isFinite(x.n)) return;
        (byLabel[x.label] = byLabel[x.label] || []).push({ n: x.n, where: name });
      });
    }

    /* ONE QUANTITY, SAID TWO WAYS. The Shelf summary said 133 bourbons and the
       chart beside it said 132, because one of them dropped a product carrying
       no key - and grading each against the engine on its own could never catch
       that, since both are "a bourbon count" and only one door was wrong. What
       catches it is that one label came back with two values.

       SOME LABELS HONESTLY DIFFER by where they are read: Open counts whiskies
       on the chart and bottles in the masthead, and L.sealedNote says so on the
       screen. Those are named, so a new disagreement is a failure rather than
       something to argue about. */
    const SPLIT_OK = ['Open', 'Sealed'];
    const twoWays = Object.keys(byLabel).filter(k => SPLIT_OK.indexOf(k) < 0
      && new Set(byLabel[k].map(x => x.n)).size > 1);
    if (twoWays.length) {
      bad(shelf.say + ': one quantity is not said two ways',
        twoWays.slice(0, 4).map(k => k + ' is '
          + byLabel[k].map(x => x.n + ' on ' + x.where).join(' and ')).join('\n'));
    } else {
      ok(shelf.say + ': one quantity is not said two ways');
    }
  }

  await b.close();
  console.log('\n  ' + (fails ? '✖ ' + fails + ' of ' + checks
    + ' failed' : '✓ all ' + checks + ' pass'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  ✖ the reader threw: ' + e.message); process.exit(1); });
