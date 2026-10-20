/* SCREENS IN SEQUENCE, AT PHONE SIZE.
 *
 * Every screen check this project had drew ONE screen and looked at it.
 * The faults BZ keeps finding are not in a screen; they are in what the
 * screen BEFORE it left behind - a flight opened after a bottle inherited
 * the bottle page's two-column layout and was drawn in strips a few words
 * wide, and the detail header kept every previous screen's More button
 * because it assumed Back was the first child (2026-09-20).
 *
 * So this walks PAIRS: every screen, then every other screen, and asks of
 * the second one whether anything is left over from the first. It is the
 * cheapest way to catch a class of fault that a single-screen check cannot
 * see at all.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PHONE = { width: 390, height: 844 };
const dir = __dirname;

/* Drawn by name, so a pair is just two of these. `detail` needs a bottle
   and `flight` a flight, which is why they are functions rather than ids. */
const SCREENS = {
  home: () => { show('home'); renderHome(); },
  shelf: () => { show('shelf'); renderShelf(); },
  shop: () => { show('shop'); renderShop(); },
  flights: () => { show('flights'); renderFlights(); },
  buddies: () => { show('buddies'); renderBuddiesTab(); },
  ref: () => { show('ref'); renderReference(); },
  settings: () => { show('settings'); renderSettings(); },
  detail: () => {
    const owned = Object.keys(S.catalog).filter(k => L.ownedCount(k, S.bottles));
    show('detail'); showBottle(owned[0]);
  },
  flight: () => {
    show('detail'); showFlight((S.flights || [])[0]);
  }
};

/* What "left over" looks like, measured rather than eyeballed. */
function faultsOf() {
  const out = [];
  const on = document.querySelector('.screen.on');
  if (!on) return ['no screen is showing'];
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 2) {
    out.push('the page scrolls sideways (' + doc.scrollWidth + 'px)');
  }
  /* A card squeezed into a column is the shape of the fillwrap fault: at
     390px a top-level card should have most of the width. */
  [...on.querySelectorAll(':scope > .sheet, :scope > div > .sheet')]
    .forEach(c => {
      const w = c.getBoundingClientRect().width;
      if (w > 0 && w < 220) {
        out.push('a card is only ' + Math.round(w) + 'px wide: '
          + (c.textContent || '').trim().slice(0, 30));
      }
    });
  /* The same button twice in a header is somebody appending to a row that
     was not cleared. */
  document.querySelectorAll('.hdr-acts, .brandacts').forEach(row => {
    const seen = {};
    [...row.children].forEach(b => {
      const label = (b.textContent || '').trim();
      if (!label) return;
      seen[label] = (seen[label] || 0) + 1;
      if (seen[label] === 2) out.push('two "' + label + '" buttons in a header');
    });
  });
  return out;
}

(async () => {
  const file = process.argv[2] || 'index.html';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: PHONE });
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));
  await p.route('http://app.local/**', r => {
    const n = r.request().url().split('app.local/')[1].split('?')[0] || file;
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const t = n.endsWith('.json') ? 'application/json'
      : n.endsWith('.js') ? 'text/javascript'
      : n.endsWith('.png') ? 'image/png' : 'text/html';
    r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
  });
  await p.route('**script.google.com**', r => r.abort());
  await p.goto('http://app.local/' + path.basename(file));
  await p.waitForTimeout(1300);

  /* BZ's shelf and flights, because the faults live on full screens. */
  const { bottles: bots, flights: flts, custom } = require('./engine.js').shelf(dir);
  await p.evaluate(([bs, fl, cu]) => {
    S.bottles = bs;
    /* AND THE PRODUCTS ONLY HIS ACCOUNT KNOWS, or 34 of his bottles have
       no product and the screens draw a poorer shelf than he has. */
    S.custom = cu;
    if (fl && fl.length) S.flights = fl;
    /* The fill rail is what turns the detail body into a row, so it is ON:
       a check that cannot reproduce the fault is not a check. */
    S.showFill = true;
    save_(); rebuildCatalog();
  }, [bots, flts, custom]);

  const names = Object.keys(SCREENS);
  const failures = [];
  let pairs = 0;

  for (const first of names) {
    for (const second of names) {
      if (first === second) continue;
      const drew = await p.evaluate(([a, c]) => {
        const draw = {
          home: () => { show('home'); renderHome(); },
          shelf: () => { show('shelf'); renderShelf(); },
          shop: () => { show('shop'); renderShop(); },
          flights: () => { show('flights'); renderFlights(); },
          buddies: () => { show('buddies'); renderBuddiesTab(); },
          ref: () => { show('ref'); renderReference(); },
          settings: () => { show('settings'); renderSettings(); },
          detail: () => {
            const owned = Object.keys(S.catalog)
              .filter(k => L.ownedCount(k, S.bottles));
            show('detail'); showBottle(owned[0]);
          },
          flight: () => { show('detail'); showFlight((S.flights || [])[0]); }
        };
        try { draw[a](); draw[c](); return true; }
        catch (e) { return String(e.message); }
      }, [first, second]);
      if (drew !== true) {
        failures.push(first + ' then ' + second + ': threw ' + drew);
        continue;
      }
      await p.waitForTimeout(90);
      const found = await p.evaluate(faultsOf);
      pairs++;
      found.forEach(f => failures.push(first + ' then ' + second + ': ' + f));
    }
  }

  /* AND THE SAME SCREEN TWICE, which is what a redraw is. */
  for (const one of names) {
    const drew = await p.evaluate(a => {
      const draw = {
        home: () => { show('home'); renderHome(); },
        shelf: () => { show('shelf'); renderShelf(); },
        shop: () => { show('shop'); renderShop(); },
        flights: () => { show('flights'); renderFlights(); },
        buddies: () => { show('buddies'); renderBuddiesTab(); },
        ref: () => { show('ref'); renderReference(); },
        settings: () => { show('settings'); renderSettings(); },
        detail: () => {
          const owned = Object.keys(S.catalog)
            .filter(k => L.ownedCount(k, S.bottles));
          show('detail'); showBottle(owned[0]);
        },
        flight: () => { show('detail'); showFlight((S.flights || [])[0]); }
      };
      try { draw[a](); draw[a](); return true; }
      catch (e) { return String(e.message); }
    }, one);
    if (drew !== true) { failures.push(one + ' twice: threw ' + drew); continue; }
    await p.waitForTimeout(90);
    const found = await p.evaluate(faultsOf);
    pairs++;
    found.forEach(f => failures.push(one + ' twice: ' + f));
  }

  /* A BUTTON THAT DOES NOTHING. Both faults in this sheet were of that
     kind (BZ, 2026-09-24): More ideas redrew the screen BEHIND the modal,
     and choosing a flight opened it behind the modal too, which on a phone
     reads as a dead button. Nothing threw and nothing drew wrong.

     IT PRESSES A SUGGESTION NOW. The flights he has built came off this
     sheet on 2026-10-19 (BZ: "why keep both") and Run one has them, so
     what is left to press is one of the seven - which closes this sheet
     and opens the flight it proposes. Same fault, same shape: the proposal
     must be in front, not behind. */
  const modalFaults = await (async () => {
    const out = [];
    await p.evaluate(() => { show('flights'); renderFlights(); showLessons(); });
    await p.waitForTimeout(350);
    const look = () => p.evaluate(() => ({
      open: document.getElementById('overlay').classList.contains('on'),
      rows: document.querySelectorAll('#sevenRoll .portstep').length,
      title: (document.querySelector('#overlay h2, #overlay .mtitle')
        || {}).textContent || '',
      pours: document.querySelectorAll('#overlay .prow, #overlay .pourrow')
        .length,
      screen: (document.querySelector('.screen.on') || {}).id
    }));
    const first = await look();
    if (!first.open || !first.rows) {
      out.push('the suggestions sheet did not open with anything to pour');
      return out;
    }
    /* EVERY ONE OF THEM, not just the first. The first is "A tour of
       kinds", which holds NOTHING - so its heading reads "Holding all",
       carries no dim=value and let the debug form through green. The one
       BZ screenshotted was "One strength, many kinds", the fourth. Seven
       sheets cost about two seconds and no guesswork. */
    const open = i => p.evaluate(n => {
      const r = document.querySelectorAll('#sevenRoll .portstep')[n];
      if (r) r.click();
      return !!r;
    }, i);
    const scan = () => p.evaluate(() => {
      const box = document.getElementById('overlay');
      const bad = [];
      if (!box) return bad;
      /* LEAF BY LEAF, NOT THE WHOLE TEXT. textContent glues adjacent
         elements with nothing between them, so the six nulls he saw read
         as "Whiskeynull80" and a \b anchored test walked straight past
         them - green on the very fault it was written for. */
      const leaves = [...box.querySelectorAll('*')]
        .filter(e => !e.children.length)
        .map(e => (e.textContent || '').trim());
      if (leaves.some(t => /^(null|undefined|NaN)$/.test(t))) {
        bad.push('a value that failed to read is printed');
      }
      /* dim=value, how a hold is stored and not how it is said. */
      if (leaves.some(t => /[a-z]+=[a-z0-9]/i.test(t))) {
        bad.push('a debug form is printed');
      }
      return bad;
    });
    const said = {};
    for (let i = 0; i < first.rows; i++) {
      if (i) {
        await p.evaluate(() => { closeModal(); showLessons(); });
        await p.waitForTimeout(250);
      }
      if (!await open(i)) { out.push('row ' + i + ' would not press'); break; }
      await p.waitForTimeout(250);
      (await scan()).forEach(x => { said[x] = (said[x] || 0) + 1; });
    }
    Object.keys(said).forEach(x =>
      out.push(x + ' (' + said[x] + ' of ' + first.rows + ')'));
    await p.evaluate(() => { closeModal(); showLessons(); });
    await p.waitForTimeout(250);
    await open(0);
    await p.waitForTimeout(300);
    const after = await look();
    /* THE PROPOSAL IS A SHEET OF ITS OWN, so the overlay stays up - what
       must not happen is the SUGGESTIONS list still being the thing on it. */
    if (!after.open) out.push('pressing a suggestion closed everything');
    if (after.rows) {
      out.push('the suggestion list is still up behind the flight it opened');
    }
    /* AND NOTHING ON IT IS A VALUE THAT FAILED TO READ. BZ, 2026-10-19,
       from a screenshot of this very sheet: "Lots of nulls" - six pours
       each labelled null, under a heading reading "Holding proof at
       proof=91±3", which is the debug form of the hold. Both were on a
       build whose seventeen checks were green: nothing threw, nothing drew
       wrong, and the words were nonsense. A word on a screen is testable
       and these two never were. */
    if (process.env.SEQ_DUMP) {
      const t = await p.evaluate(() =>
        (document.getElementById('overlay') || {}).textContent || '');
      console.log('  DUMP[' + t.length + ']: ' + t.slice(0, 500));
    }
    return out;
  })();
  modalFaults.forEach(f => failures.push('suggestions: ' + f));

  /* AND THE SEVEN, AND THAT REGENERATING THEM CHANGES ANYTHING. BZ asked
     for "a regen of the suggestions", and a regenerate that hands back the
     same seven is the dead button this whole block exists to catch: two of
     the seven hold nothing that rotates, so without carrying what was
     already poured they came back identical. */
  const sevenFaults = await (async () => {
    const out = [];
    await p.evaluate(() => { show('flights'); renderFlights(); showLessons(); });
    await p.waitForTimeout(300);
    const read = () => p.evaluate(() =>
      [...document.querySelectorAll('#sevenRoll .portstep')]
        .map(x => x.textContent.trim()));
    const before = await read();
    if (!before.length) {
      out.push('no suggestions on the sheet at all');
      return out;
    }
    const pressed = await p.evaluate(() => {
      const b = [...document.querySelectorAll('#overlay button')]
        .filter(x => /Show me seven others/.test(x.textContent))[0];
      if (b) b.click();
      return !!b;
    });
    if (!pressed) { out.push('no way to ask for another seven'); return out; }
    await p.waitForTimeout(400);
    const after = await read();
    if (!after.length) out.push('asking for another seven emptied the list');
    else if (after.join('|') === before.join('|')) {
      out.push('another seven handed back the same ' + after.length);
    }
    /* ROW BY ROW, AND NAMING ONE. The joined compare passes while six of
       seven rotate, so it stayed green with the carry-over deliberately
       removed - which is the fault it was written for. "A tour of kinds"
       holds nothing, so the round has nothing to rotate for it and only
       what was already poured can move it: if that row repeats, the
       regenerate is not regenerating. */
    const sameRows = after.filter(x => before.indexOf(x) >= 0);
    if (sameRows.length) {
      out.push(sameRows.length + ' of ' + after.length
        + ' came back unchanged, first: ' + sameRows[0].slice(0, 60));
    }
    const stillOpen = await p.evaluate(() =>
      document.getElementById('overlay').classList.contains('on'));
    if (!stillOpen) out.push('asking for another seven closed the sheet');
    return out;
  })();
  sevenFaults.forEach(f => failures.push('seven: ' + f));


  /* AND GOING BACK. Home has no header of its own and no way back, so a
     back button anywhere on it is a button pointing at a screen you have
     already left. */
  const trailFaults = await (async () => {
    const out = [];
    await p.evaluate(() => { goTo('home'); renderHome(); });
    await p.evaluate(() => { goTo('settings'); renderSettings(); });
    await p.evaluate(() => { goTo('library'); });
    await p.goBack(); await p.waitForTimeout(150);
    await p.goBack(); await p.waitForTimeout(300);
    const seen = await p.evaluate(() => ({
      screen: (document.querySelector('.screen.on') || {}).id,
      showing: [...document.querySelectorAll('#scr-home .backbtn')]
        .filter(x => !x.hidden).map(x => x.textContent.trim()),
      trail: _from.slice()
    }));
    if (seen.screen !== 'scr-home') {
      out.push('two backs from the library should land on home, not '
        + seen.screen);
    }
    if (seen.showing.length) {
      out.push('home is showing a back button: ' + seen.showing.join(', '));
    }
    if (seen.trail.length) {
      out.push('the trail still holds ' + JSON.stringify(seen.trail)
        + ' after going back to home');
    }
    return out;
  })();
  trailFaults.forEach(f => failures.push('back to home: ' + f));

  await b.close();

  if (threw.length) {
    threw.slice(0, 3).forEach(m => failures.push('page error: ' + m));
  }
  if (failures.length) {
    console.log('\n✖ ' + failures.length + ' of ' + pairs + ' sequences left something behind\n');
    failures.slice(0, 20).forEach(f => console.log('    ' + f));
    process.exit(1);
  }
  console.log('✓ ' + pairs + ' screen sequences leave nothing behind at '
    + PHONE.width + 'px\n');
})();

