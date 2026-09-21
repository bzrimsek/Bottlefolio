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
  const bots = JSON.parse(fs.readFileSync(path.join(dir, 'bz-bottles.json'), 'utf8'));
  const flts = fs.existsSync(path.join(dir, 'bz-flights.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'bz-flights.json'), 'utf8')) : [];
  await p.evaluate(([bs, fl]) => {
    S.bottles = bs;
    if (fl && fl.length) S.flights = fl;
    /* The fill rail is what turns the detail body into a row, so it is ON:
       a check that cannot reproduce the fault is not a check. */
    S.showFill = true;
    save_(); rebuildCatalog();
  }, [bots, flts]);

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
