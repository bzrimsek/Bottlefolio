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
  /* The SDK, answered here and signed out — see fake-sdk.js. */
  await require('./fake-sdk.js').offline(p);
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

  /* BUILDING A FLIGHT ENDS SOMEWHERE. BZ, 2026-10-26, watching a guest
     design one: "it did not appear in their list although it said 2 in the
     count." It was saved and it was fine - Save flight redrew the Flights
     screen with the list CLOSED, so they landed on the four tiles, where
     the header counts their flights and no list is on the page. The count
     and the absence were the same screen.

     NOTHING IS PRESSED AFTER SAVE, because that is the whole point: the
     build has to finish by itself. */
  const buildFaults = await (async () => {
    const out = [];
    await p.evaluate(() => {
      S.customFlights = [];
      save_();
      show('flights'); FLIGHTS_OPEN = false; renderFlights();
      flightBuilder();
    });
    await p.waitForTimeout(500);
    /* THE DESIGNER IS A PAGE SINCE 2026-10-26, so Design it is on the
       screen and Keep it and Save are in the editor's sheet over it. */
    const press = re => p.evaluate(r => {
      const b = [...document.querySelectorAll('#scr-design button, '
        + '#overlay button')]
        .filter(x => new RegExp(r, 'i').test(x.textContent))[0];
      if (b) b.click();
      return !!b;
    }, re);
    if (!await press('design it')) { out.push('no way to design one'); return out; }
    await p.waitForTimeout(1200);
    if (!await press('keep it')) { out.push('a design with no way to keep it'); return out; }
    await p.waitForTimeout(600);
    if (!await press('save flight')) { out.push('a flight with no way to save it'); return out; }
    await p.waitForTimeout(900);
    const end = await p.evaluate(() => ({
      mine: (S.customFlights || []).length,
      cards: document.querySelectorAll('#scr-flights .fcard').length,
      fresh: document.querySelectorAll('#scr-flights .fcard.fresh').length,
      title: ((S.customFlights || [])[0] || {}).title || '',
      first: (document.querySelector('#scr-flights .fcard h3') || {})
        .textContent || ''
    }));
    if (end.mine !== 1) out.push('saving kept ' + end.mine + ' flight(s)');
    if (!end.cards) {
      out.push('it was saved and the list it belongs to is not on the screen');
    }
    if (end.cards && !end.fresh) out.push('nothing marks the one just built');
    /* AND IT LEADS, because "order added" puts a new flight LAST - behind
       forty, on his shelf - which is no better than not being there. */
    if (end.cards && end.first.toUpperCase().indexOf(
        end.title.toUpperCase()) < 0) {
      out.push('the one just built is not the first row: ' + end.first);
    }
    /* AND IT IS NOT CALLED AFTER THE PREMISE. A guest's first flight was
       NOTHING HERE IS HELD STILL BUT THE QUESTION. */
    if (/nothing here is held/i.test(end.title)) {
      out.push('it is named after the premise: ' + end.title);
    }
    if (/undefined/i.test(end.title)) out.push('its name says undefined');
    return out;
  })();
  buildFaults.forEach(f => failures.push('build: ' + f));

  /* A FLIGHT BACK FROM THE ACCOUNT, WITH ITS BENCH GONE. From his own log
     on 2026-10-26, three screens in four minutes:

       threw on flights:  Cannot read properties of undefined ('length')
       threw on buddies:  ... the same
       threw on home:     ... the same

     all at f.ext.length, and all after he designed his first flight. A new
     flight is saved with an empty bench, an empty list does not survive the
     trip to the account and back, and it came home with the key absent - so
     the first render of the first flight he ever built threw before it
     drew. Driven through the real screens, because the engine door can be
     right while nothing calls it: a test of L.wholeFlight on its own stayed
     green with the repair taken off allFlights. */
  const bareFaults = await (async () => {
    const out = [];
    const threw = [];
    p.on('pageerror', e => threw.push(String((e && e.message) || e)));
    await p.evaluate(() => {
      S.customFlights = [{ title: 'BACK FROM THE ACCOUNT',
        premise: 'A flight that went to the account and came home.',
        core: (S.flights[0] ? S.flights[0].core : []).slice(0, 3) }];
      save_();
    });
    for (const scr of ['flights', 'home', 'buddies']) {
      /* CAUGHT, NOT THROWN. A render that dies inside page.evaluate takes
         the harness with it, and a crash is a worse report than a named
         failure - seq exits 1 either way, but only one of them says which
         screen and why. */
      const boom = await p.evaluate(s => {
        try {
          show(s);
          if (s === 'flights') { FLIGHTS_OPEN = true; S.fflt.state = 'all';
            renderFlightFilters(); renderFlights(); }
          if (s === 'home') renderHome();
          if (s === 'buddies') renderBuddiesTab();
          return '';
        } catch (e) { return String((e && e.message) || e); }
      }, scr);
      if (boom) out.push(scr + ' threw: ' + boom.slice(0, 60));
      await p.waitForTimeout(220);
      const drew = await p.evaluate(s =>
        (document.getElementById('scr-' + s) || {}).childElementCount || 0, scr);
      if (!drew) out.push(scr + ' drew nothing with a bench-less flight');
    }
    threw.forEach(t => out.push('threw: ' + t.slice(0, 70)));
    return out;
  })();
  bareFaults.forEach(f => failures.push('bench: ' + f));

  /* A HALF-BUILT FLIGHT SURVIVES A WRONG TAP. BZ, 2026-10-26: "because the
     designer is a modal, any errant click loses all work before the save."
     Nothing is saved until Save flight, so the design WAS the work, and a
     modal closes on Escape, on back and on any nav tab.

     It is a page now, and a page can still be walked off - so this sets a
     hold, presses a nav tab, comes back, and looks for the hold. */
  const keepFaults = await (async () => {
    const out = [];
    await p.evaluate(() => { show('flights'); renderFlights(); flightBuilder(); });
    await p.waitForTimeout(500);
    /* WHICH SWITCH IS ON, not how many elements there are. The first
       version counted `#scr-design *` before and after, and a rebuild
       draws exactly as many things as it drew the first time - so the
       check stayed green with the keeping deliberately removed, which is
       the fault it exists for. */
    const held = () => p.evaluate(() =>
      [...document.querySelectorAll('#scr-design [role=switch]')]
        .map(b => ((b.querySelector('.nm') || {}).textContent || '')
          .trim()
          + '=' + b.getAttribute('aria-checked')).join('|'));
    const before = await held();
    if (!before) { out.push('the designer drew no switches'); return out; }
    const set = await p.evaluate(() => {
      const sw = [...document.querySelectorAll('#scr-design [role=switch]')]
        .filter(b => b.getAttribute('aria-checked') === 'false')[0];
      if (sw) sw.click();
      return !!sw;
    });
    if (!set) { out.push('nothing to hold on the designer'); return out; }
    await p.waitForTimeout(200);
    const after = await held();
    if (after === before) out.push('pressing a switch held nothing');
    /* THE WRONG TAP: a nav tab, which is what closed the sheet. */
    await p.evaluate(() => {
      const b = document.querySelector('nav button[data-scr="home"]');
      if (b) b.click();
    });
    await p.waitForTimeout(250);
    const left = await p.evaluate(() =>
      (document.querySelector('.screen.on') || {}).id);
    if (left === 'scr-design') out.push('a nav tab did not leave the page');
    /* AND BACK. */
    await p.evaluate(() => { show('flights'); renderFlights(); flightBuilder(); });
    await p.waitForTimeout(400);
    const onNow = await p.evaluate(() =>
      (document.querySelector('.screen.on') || {}).id);
    if (onNow !== 'scr-design') out.push('coming back did not open it');
    const kept = await held();
    if (kept !== after) {
      out.push('a tab press threw the design away: held ' + after
        + ', came back to ' + kept);
    }
    /* AND Start again IS THE ONE THING THAT CLEARS IT. */
    const cleared = await p.evaluate(() => {
      const b = [...document.querySelectorAll('#scr-design button')]
        .filter(x => /start again/i.test(x.textContent))[0];
      if (!b) return -1;
      b.click();
      return 1;
    });
    if (cleared === -1) out.push('no way to start again');
    return out;
  })();
  keepFaults.forEach(f => failures.push('design: ' + f));

  /* THE WAY OUT DOES NOT SCROLL AWAY. BZ, 2026-10-26, of the flights list:
     "why is the flights back button not in the corner?" It was in the
     corner - it had left. The .filterbar sticks and the header did not, so
     one flick pinned the search and filters to the top and took the mark,
     the title, the count and Back with it: measured at 390px, the header
     sat at -304 while the bar held at -4.

     EVERY SCREEN WITH A FILTER BAR, because the shelf had it too and
     nobody had noticed. */
  const stickFaults = await (async () => {
    const out = [];
    for (const scr of ['flights', 'shelf']) {
      await p.evaluate(s => {
        show(s);
        if (s === 'flights') { FLIGHTS_OPEN = true; S.fflt.state = 'all';
          renderFlightFilters(); renderFlights(); }
        if (s === 'shelf') { renderShelfFilters(); renderShelf(); }
      }, scr);
      await p.waitForTimeout(260);
      const seen = await p.evaluate(s => {
        const box = document.getElementById('scr-' + s);
        box.scrollTop = 320;
        const hdr = box.querySelector(':scope > .hdr');
        if (!hdr) return { none: true };
        const r = hdr.getBoundingClientRect();
        return { top: Math.round(r.top),
                 on: r.bottom > 0 && r.top < innerHeight,
                 scrolled: Math.round(box.scrollTop) };
      }, scr);
      if (seen.none) { out.push(scr + ' has no header of its own'); continue; }
      /* A LIST TOO SHORT TO SCROLL PROVES NOTHING, so this only judges when
         it actually moved. */
      if (seen.scrolled < 100) continue;
      if (!seen.on) {
        out.push(scr + ': the header scrolled away at ' + seen.scrolled
          + 'px - its top is ' + seen.top);
      }
      await p.evaluate(s => {
        document.getElementById('scr-' + s).scrollTop = 0;
      }, scr);
    }
    return out;
  })();
  stickFaults.forEach(f => failures.push('header: ' + f));






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

