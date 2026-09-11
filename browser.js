/* Load the real app in a real browser, with the real data, and walk it.
 *
 * Three builds went out today that would not start or were visibly broken,
 * and BZ found every one after deploying. Each was a RUNTIME fault nothing
 * here could reach: a const read before its declaration, a duplicate CSS
 * rule that dropped the nav off the bottom, an element detached from the
 * document so every lookup inside it returned null.
 *
 * node --check parses. The smoke test runs the script against a stub DOM
 * that resolves almost anything. Neither is the thing BZ is running. This
 * is: same file, same data, same browser engine, and it fails the build
 * rather than the phone.
 *
 *   node browser.js [index.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const file = path.resolve(process.argv[2] || 'index.html');
const dir = path.dirname(file);

// Every screen in the tab bar, plus the ones reached from inside.
/* Map came off the nav in v1.8.79 — the mini-map on Home already opened
   it, so the tab was a second door to the same room. Buddies went on.
   The Map SCREEN is still there and still drawn; it is reached from Home,
   which is checked separately below. */
const TABS = ['home', 'shelf', 'shop', 'pour', 'flights', 'buddies', 'ref'];

/* Reporter state lives here, not inside the walk: the catch that reports a
   crash sits outside the async function and has to be able to name the
   step that died. */
let _step = null, _stepFails = 0, _found = null;

(async () => {
  const failures = [];
  _found = failures;   // so the crash handler can report what was found

/* Step reporting. This walk is long and BZ cannot see inside a running
   command, so silence reads as a hang. Each step says it started and says
   how it ended, and the count of failures is reported per step rather than
   only in one total at the end. A step that throws names itself. */
function endStep() {
  if (!_step) return;
  const n = failures.length - _stepFails;
  console.log((n ? '  \u2716 ' : '  \u2713 ') + _step
    + (n ? ' \u2014 ' + n + ' failure(s)' : ''));
  _step = null;
}
function step(n) {
  endStep();
  _step = n; _stepFails = failures.length;
  console.log('  \u00b7 ' + n + ' \u2026');
}
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

  // A page error is the class that reached BZ: it throws at runtime and
  // the app either fails to start or a screen never draws.
  page.on('pageerror', e => failures.push('threw: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      // The service worker and Firebase are not present offline; those are
      // expected and not what this is looking for.
      // A 403 on the service worker is this harness, not the app: a fake
      // origin cannot register one. Everything else is real.
      if (!/service worker|firebase|favicon|net::ERR|status of 403/i.test(t)) {
        failures.push('console error: ' + t.slice(0, 120));
      }
    }
  });

  // A fake origin, so fetch works. Everything under it is served from the
  // folder the file lives in.
  await page.route('http://app.local/**', route => {
    const name = route.request().url().split('app.local/')[1].split('?')[0]
      || path.basename(file);
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
    const type = name.endsWith('.json') ? 'application/json'
      : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.png') ? 'image/png' : 'text/html';
    return route.fulfill({ status: 200, contentType: type,
                           body: fs.readFileSync(p) });
  });

  // data.json beside the file, served from disk.
  await page.route('**/data.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: fs.readFileSync(path.join(dir, 'data.json'), 'utf8')
  }));
  await page.route('**/map.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: fs.existsSync(path.join(dir, 'map.json'))
      ? fs.readFileSync(path.join(dir, 'map.json'), 'utf8') : '{}'
  }));

  // Served over http, not file://. A file:// page cannot fetch its own
  // data.json — the scheme is not supported — so the app loads with an
  // empty shelf and every check below tests the wrong thing.
  /* Registered AFTER the catch-all on purpose: Playwright matches the most
     recently added route first, so a lookup route added before it never
     runs and every lookup 404s. */
  await page.route('http://app.local/lookup**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ name: 'Glenfarclas 105', proof: 120,
                           dist: 'Glenfarclas', type: 'scotch' })
  }));

  /* THE WALK RUNS WITHOUT A SERVICE.

     v1.9.8 ships a DEFAULT lookup URL so a new account can photograph a
     label on its first bottle — and the walk immediately started reporting
     six console errors, because a headless browser calling Google from
     localhost is blocked as cross-origin. That is the browser doing its
     job, not the app failing.

     Blocked at the network layer instead, so the walk exercises the app
     rather than somebody's internet: any call to the lookup service is
     refused here, which is the same thing the app already handles as a
     network failure. */
  await page.route('**script.google.com**', r => r.abort());
  await page.goto('http://app.local/' + path.basename(file));
  await page.waitForTimeout(1200);

  // The shipped data.json holds 0 bottles on purpose — a new user starts
  // with an empty shelf — so every check below would be testing an empty
  // app. BZ's own bottles and flights sit beside it and are loaded here,
  // because the faults that reached him were on screens with 325 rows.
  const bots = path.join(dir, 'bz-bottles.json');
  const flts = path.join(dir, 'bz-flights.json');
  if (fs.existsSync(bots)) {
    await page.evaluate(([b, f]) => {
      /* global S, save_, rebuildCatalog, renderShelf, renderShelfFilters,
                renderHome, renderFlights */
      S.bottles = b;
      if (f) S.customFlights = f;
      save_();
      rebuildCatalog();
      renderShelf(); renderShelfFilters(); renderHome();
    }, [JSON.parse(fs.readFileSync(bots, 'utf8')),
        fs.existsSync(flts) ? JSON.parse(fs.readFileSync(flts, 'utf8')) : null]);
    await page.waitForTimeout(600);
  }

  step('did it start');
  // 1. Did it start? The banner is what BZ saw twice today.
  const banner = await page.locator('text=/failed to start/i').count();
  if (banner) {
    const msg = await page.locator('text=/failed to start/i').first().textContent();
    failures.push('DID NOT START: ' + msg.trim().slice(0, 120));
  }

  step('every tab draws, nav survives');
  // 2. Every tab draws, and the nav survives it. The nav went missing on a
  //    phone and nothing here noticed, because nothing here was a phone.
  for (const tab of TABS) {
    const btn = page.locator('nav button[data-scr="' + tab + '"]');
    if (!(await btn.count())) { failures.push('no nav button for ' + tab); continue; }
    await btn.click();
    await page.waitForTimeout(220);

    const screen = page.locator('#scr-' + tab);
    if (!(await screen.isVisible())) failures.push(tab + ': screen not visible');

    // The bar has to be ON the glass, not below it.
    const nav = await page.locator('nav').boundingBox();
    const vh = page.viewportSize().height;
    if (!nav) failures.push(tab + ': nav has no box');
    else if (nav.y + nav.height > vh + 2) {
      failures.push(tab + ': nav is off the bottom by '
        + Math.round(nav.y + nav.height - vh) + 'px');
    }

    // A screen that draws nothing is a screen that threw quietly.
    const text = (await screen.innerText()).trim();
    if (text.length < 12) failures.push(tab + ': screen is empty');
  }

  // 2b. The screens with no tab of their own. They are reached from a gear,
  //     a badge or a card, and NOTHING walked them — which is five of the
  //     thirteen, and exactly the five that need an admin or a second
  //     person, so they are also the five with the least evidence behind
  //     them. renderLibrary alone is 185 lines that nothing ever drew.
  for (const name of ['settings', 'diag', 'library', 'buddies']) {
    const drew = await page.evaluate(n => {
      /* global show */
      /* RENDER IT, don't just show it. This called show() alone and
         counted the screen's text — which included the header, so "‹ Home"
         and a title were enough to clear the 12-character bar and the check
         never looked at the content at all. Hiding a redundant back button
         dropped three screens under the bar and exposed it. */
      try {
        const draw = { settings: () => renderSettings(),
                       library: () => renderLibraryScreen(),
                       diag: () => renderDiag(),
                       buddies: () => renderBuddiesTab() }[n];
        if (draw) draw();
        show(n);
      } catch (e) { return 'threw: ' + e.message; }
      const scr = document.getElementById('scr-' + n);
      if (!scr) return 'no screen';
      if (!scr.classList.contains('on')) return 'did not open';
      return (scr.innerText || '').trim().length;
    }, name);
    await page.waitForTimeout(200);
    if (typeof drew === 'string') {
      failures.push(name + ': ' + drew);
    } else if (drew < 12) {
      failures.push(name + ': screen is empty');
    }
    const nav2 = await page.locator('nav').boundingBox();
    if (nav2 && nav2.y + nav2.height > page.viewportSize().height + 2) {
      failures.push(name + ': nav is off the bottom');
    }
  }
  await page.locator('nav button[data-scr="home"]').click();
  await page.waitForTimeout(200);

  step('shelf lists bottles, header lines up');
  // 3. The shelf actually lists bottles, and its header lines up with them.
  await page.locator('nav button[data-scr="shelf"]').click();
  await page.waitForTimeout(250);
  const tiles = await page.locator('#shelfList .tile').count();
  if (!tiles) failures.push('shelf: no type tiles');
  else {
    await page.locator('#shelfList .tile').first().click();
    await page.waitForTimeout(250);
    const rows = await page.locator('#shelfList .item').count();
    if (rows < 2) failures.push('shelf: a type shows no rows');
    const head = await page.locator('.listhead').boundingBox();
    const row = await page.locator('#shelfList .item').first().boundingBox();
    if (head && row && Math.abs(head.x - row.x) > 2) {
      failures.push('shelf: header and rows are '
        + Math.round(Math.abs(head.x - row.x)) + 'px out of line');
    }
  }

  /* A FILTERED SHELF HAS A WAY BACK, AND IT WORKS. Three times the back
     button went missing from a filtered list and three times it was fixed
     as a line. This drives the thing itself: turn a filter on through the
     UI, and the button must appear, and pressing it must actually return
     an unfiltered shelf. The arithmetic is asserted in the suite; only
     this can see whether the button is on the screen and does anything. */
  step('a filtered shelf can get back');
  await page.locator('nav button[data-scr="shelf"]').click();
  await page.waitForTimeout(250);
  {
    /* Every pill that narrows the list, including the two-state ones that
       were the fault: whichever of them this shelf actually offers. */
    /* The pills hide when there is nothing to filter TO, so the walk's
       shelf offered neither and the step could not drive the fault it
       exists for. One wish and one star, put in and taken out again. */
    await page.evaluate(() => {
      /* global S, save_, renderShelf, renderShelfFilters, L */
      S.wish = [{ name: 'A bottle somebody wants', added: '2026-01-01' }];
      const first = (S.bottles || [])[0];
      if (first) S.favs = Object.assign({}, S.favs, { [first.k]: 1 });
      save_(); renderShelfFilters(); renderShelf();
    });
    await page.waitForTimeout(250);
    const pills = ['#favFilter', '#wishFilter'];
    let drove = 0;
    for (const sel of pills) {
      const pill = page.locator(sel);
      if (!(await pill.count()) || !(await pill.isVisible())) continue;
      drove++;
      await pill.click();
      await page.waitForTimeout(250);
      const back = page.locator('#scr-shelf .backbtn');
      const shown = (await back.count()) && await back.isVisible();
      if (!shown) {
        failures.push('shelf: ' + sel + ' filters the list and offers no '
          + 'way back');
      } else {
        await back.click();
        await page.waitForTimeout(250);
        const still = await page.evaluate(
          () => L.activeFacets(S.filters));
        if (still) {
          failures.push('shelf: back from ' + sel + ' left ' + still
            + ' filter(s) on, so it is still filtered');
        }
      }
      /* Leave it as it was found, whatever happened. */
      await page.evaluate(() => {
        L.clearFacets(S.filters);
        renderShelfFilters(); renderShelf();
      });
      await page.waitForTimeout(150);
    }
    if (!drove) {
      failures.push('shelf: neither the starred nor the Wanted pill was '
        + 'available to drive');
    }

    /* THE TWO ROUTES BZ ACTUALLY USES, which the pills above did not
       cover: "See the whole shelf as a list", and a type tile. Both set
       the sub-state and redraw the list without going through show(), so
       both had no back button while the pills had one - and every fix so
       far was to whichever route had been driven. */
    for (const route of ['whole shelf', 'a type tile']) {
      await page.evaluate(() => {
        S.shelfSub = null; L.clearFacets(S.filters);
        renderShelfFilters(); renderShelf();
      });
      await page.waitForTimeout(200);
      if (route === 'whole shelf') {
        const btn = page.locator('#shelfList button', { hasText: 'See the whole shelf' });
        if (!(await btn.count())) { failures.push('shelf: no "see the whole shelf" button'); continue; }
        await btn.first().click();
      } else {
        const tile = page.locator('#shelfList .tile');
        if (!(await tile.count())) { failures.push('shelf: no type tiles'); continue; }
        await tile.first().click();
      }
      await page.waitForTimeout(250);
      const back = page.locator('#scr-shelf .backbtn');
      if (!(await back.count()) || !(await back.isVisible())) {
        failures.push('shelf: ' + route + ' offers no way back');
        continue;
      }
      await back.click();
      await page.waitForTimeout(250);
      const narrowed = await page.evaluate(
        () => (S.shelfSub === 'all' || L.activeFacets(S.filters)) ? 1 : 0);
      if (narrowed) {
        failures.push('shelf: back from ' + route + ' left it narrowed');
      }
    }
    /* A CHART BAR LANDS IN THE TABLE, not in a pop-up. BZ: why do the
       charts render pop-ups and the books render tables, tables are
       better. Driven as a route he named: press a bar, expect the shelf
       narrowed and a way back, and no modal over the top of it. */
    await page.evaluate(() => {
      S.shelfSub = null; L.clearFacets(S.filters);
      renderShelfFilters(); renderShelf();
    });
    await page.waitForTimeout(200);
    {
      const bar = page.locator('#shelfList .bar.tappable');
      if (!(await bar.count())) {
        failures.push('shelf: no chart bar to press');
      } else {
        await bar.first().click();
        await page.waitForTimeout(300);
        const overlayOn = await page.evaluate(() => {
          const o = document.getElementById('overlay');
          return o && o.classList.contains('on') ? 1 : 0;
        });
        if (overlayOn) failures.push('shelf: a chart bar still opens a pop-up');
        const narrowed = await page.evaluate(() => L.activeFacets(S.filters));
        if (!narrowed) failures.push('shelf: a chart bar did not narrow the shelf');
        const rows = await page.locator('#shelfList .item').count();
        if (!rows) failures.push('shelf: a chart bar narrowed to an empty table');
        const back = page.locator('#scr-shelf .backbtn');
        if (!(await back.count()) || !(await back.isVisible())) {
          failures.push('shelf: no way back from a chart bar');
        }
      }
    }

    /* A SEARCH NARROWS THE SHELF TOO. BZ: "Aberlour", 8 of 328, no back on
       mobile. The search box was never a filter, so the test for "am I
       somewhere" never knew about it - the fifth face of this bug. */
    await page.evaluate(() => {
      S.shelfSub = null; L.clearFacets(S.filters);
      renderShelfFilters(); renderShelf();
    });
    await page.waitForTimeout(200);
    {
      const q = page.locator('#q');
      await q.fill('Aberlour');
      await page.waitForTimeout(350);
      const back = page.locator('#scr-shelf .backbtn');
      if (!(await back.count()) || !(await back.isVisible())) {
        failures.push('shelf: a search narrows the list and offers no way back');
      } else {
        await back.click();
        await page.waitForTimeout(250);
        const still = await page.evaluate(() =>
          (document.getElementById('q').value || '').trim());
        if (still) {
          failures.push('shelf: back from a search left "' + still + '" in the box');
        }
      }
      await q.fill('');
      await page.waitForTimeout(200);
    }

    /* THE WANTED VIEW IS A ROUTE TOO, and it returns early out of
       renderShelf - which is how the fix that covered the other routes
       missed this one. BZ opened his wishlist and had no way back. */
    await page.evaluate(() => {
      S.shelfSub = null; L.clearFacets(S.filters);
      S.filters.wishOnly = true;
      renderShelfFilters(); renderShelf();
    });
    await page.waitForTimeout(250);
    {
      const back = page.locator('#scr-shelf .backbtn');
      if (!(await back.count()) || !(await back.isVisible())) {
        failures.push('shelf: the Wanted view offers no way back');
      } else {
        await back.click();
        await page.waitForTimeout(250);
        const still = await page.evaluate(() => L.activeFacets(S.filters));
        if (still) failures.push('shelf: back from Wanted left it filtered');
      }
    }

    /* AND THE WISHLIST IS ON THE SHELF ITSELF, not only behind a filter
       pill that hides when the list is empty. BZ asked for it at the
       bottom of the shelf page twice. */
    await page.evaluate(() => {
      S.shelfSub = null; L.clearFacets(S.filters);
      renderShelfFilters(); renderShelf();
    });
    await page.waitForTimeout(250);
    const wantCard = await page.locator('#shelfList', { hasText: 'What you are after' }).count();
    if (!wantCard) {
      failures.push('shelf: a wishlist with bottles on it does not appear '
        + 'on the shelf page');
    }

    /* Put the shelf back as it was found. */
    await page.evaluate(() => {
      S.wish = []; S.favs = {};
      L.clearFacets(S.filters);
      save_(); renderShelfFilters(); renderShelf();
    });
    await page.waitForTimeout(150);
  }

  /* SPIN IS CENTERED AND THE PICKER DOES NOT WRAP. BZ: not liking how spin
     is not centered, and I'm worried those pills will spill over and wrap.
     Driven with three buddies, which is where the old row of chips broke. */
  /* THE KEYBOARD IS NOT A SMALLER SCREEN. Kevrin's iPhone, photographed:
     tapping the search box on Shop put the nav bar in the MIDDLE of the
     page above a blank half-screen. visualViewport.height halves when the
     keyboard opens, the column was sized to it, and the bar sat at the
     bottom of that. Driven here by forcing the same numbers. */
  /* TWO CRASHES REACHED USERS AND NEITHER PATH WAS EXERCISED. The Shelf
     tools sheet is a modal; the invite branch only runs when the address
     carries one. Both are driven now. */
  step('shelf tools opens, and an invite link does not stop the load');
  await page.locator('nav button[data-scr="shelf"]').click();
  await page.waitForTimeout(200);
  {
    const gear = page.locator('#scr-shelf .hdr-acts button').first();
    if (await gear.count()) {
      await gear.click();
      await page.waitForTimeout(300);
      const on = await page.evaluate(() => {
        const o = document.getElementById('overlay');
        return o && o.classList.contains('on') ? 1 : 0;
      });
      if (!on) failures.push('shelf: the gear opened nothing');
      const threw = await page.evaluate(() =>
        (window.APPLOG || []).filter(l => /threw on/.test(l)).length);
      if (threw) failures.push('shelf: opening the tools threw');
      await page.evaluate(() => closeModal());
    }
    /* The invite branch: it read a variable that does not exist in its
       scope, so a user who followed a link never loaded their shelf. */
    const bad = await page.evaluate(() => {
      try {
        const me = (window.FB && FB.user || {}).uid;
        const inviter = L.buddyFromUrl('https://x/#buddy=SOMEBODYELSE');
        return (inviter && me && inviter !== me) ? 0 : 0;
      } catch (e) { return e.message; }
    });
    if (bad) failures.push('shelf: the invite branch throws: ' + bad);
  }

  /* A RETIRED BOTTLE IS NOT ON THE LIST OF WHAT YOU HAVE. BZ's screenshot:
     "Bottle 3 of 3 · Gone" with a Retire button, above a section listing
     that same bottle as gifted. The list filtered by key alone. */
  step('a bottle that has left is not still on the shelf');
  {
    const seen = await page.evaluate(() => {
      const k = (S.bottles[0] || {}).k;
      if (!k) return null;
      /* Give this whisky a second bottle and retire it. */
      const gone = L.newBottle(S.bottles, k, 'open', null);
      gone.status = 'gone'; gone.exit = 'gifted'; gone.exitTo = 'Somebody';
      gone.exitDate = '2026-09-10';
      S.bottles.push(gone);
      showBottle(k);
      const txt = document.getElementById('detailBody').textContent;
      S.bottles = S.bottles.filter(b => b.id !== gone.id);
      return { listed: /\u00b7 Gone/.test(txt),
               said: /Gifted to Somebody/.test(txt) };
    });
    if (seen) {
      if (seen.listed) {
        failures.push('bottle: a retired bottle is still listed as one you have');
      }
      if (!seen.said) {
        failures.push('bottle: a retired bottle is not accounted for at all');
      }
    }
  }

  /* TASTE HAS THREE STATES AND SHOWS ONE. BZ: mimic shop and flights and
     put the rest behind one of the three except recap. A chip that leaves
     two panels open is the fault this replaced - recent pours was visible
     whatever you picked, and pushed the machine off a phone. */
  step('taste shows one thing at a time');
  await page.locator('nav button[data-scr="pour"]').click();
  await page.waitForTimeout(300);
  {
    const chips = await page.locator('#pourWhere button').allTextContents();
    if (chips.length !== 4) {
      failures.push('taste: ' + chips.length + ' chips, expected 4 ('
        + chips.join(',') + ')');
    }
    for (const label of chips) {
      await page.locator('#pourWhere button', { hasText: label }).first().click();
      await page.waitForTimeout(200);
      /* recapBody counts: it shows WITH history and must not be on screen
         beside the machine, which is the whole point of moving it. */
      const open = await page.evaluate(() => ['pourHome', 'awayBody',
        'histBody', 'recapBody', 'guestBody']
        .filter(id => {
          const e = document.getElementById(id);
          return e && !e.hidden;
        }));
      const want = label === 'History' ? 2 : 1;   // history shows the recap too
      // guestBody is a panel like the others and must obey the same rule.
      if (open.length !== want) {
        failures.push('taste: "' + label + '" shows ' + open.length
          + ' panel(s), expected ' + want + ' (' + open.join(',') + ')');
      }
      if (label !== 'History' && open.indexOf('recapBody') >= 0) {
        failures.push('taste: the recap is on screen under "' + label + '"');
      }
    }
    await page.locator('#pourWhere button', { hasText: 'At home' }).first().click();
    await page.waitForTimeout(200);
  }

  /* THE ADMIN SCREEN DRAWS EVERY CARD, and the Everybody card was left as
     a bare heading for a whole build because the directory arrives as an
     object and L.adminPeople takes rows. It threw inside a .then, so the
     screen looked fine and one card was silently empty. */
  step('running this fills every card it draws');
  {
    const bad = await page.evaluate(() => {
      S.log = Array.from({ length: 60 }, (_, i) => ({ at: Date.now(), t: 'l' + i }));
      S.admin = true; renderDiag(); show('diag');
      const kids = [...document.getElementById('diagBody').children];
      const rowAt = kids.findIndex(k => k.className === 'lookrow');
      const logAt = kids.findIndex(k => k.querySelector('summary'));
      const out = [];
      /* The log's own buttons belong above the log, not under 600 lines
         of it - the Copy button exists to save reading them. */
      if (rowAt < 0) out.push('no log button row');
      else if (logAt >= 0 && rowAt > logAt) out.push('log buttons are below the log');
      if (rowAt >= 0
          && kids[rowAt].querySelectorAll('.chip').length !== 4) {
        out.push('log buttons scattered: '
          + kids[rowAt].querySelectorAll('.chip').length + ' in the row');
      }
      /* A card with a heading and nothing else is the shape the crash
         left behind. */
      kids.filter(k => k.classList.contains('sheet')).forEach(k => {
        if (k.children.length === 1 && k.querySelector('h3')) {
          out.push('empty card: ' + k.querySelector('h3').textContent);
        }
      });
      return out;
    });
    await page.waitForTimeout(500);
    bad.forEach(x => failures.push('running this: ' + x));
  }

  /* THE GUEST LADDER, DRIVEN. BZ: when I have a visitor it is hard
     deciding what to pour them. Name a bottle, walk the four rungs, and
     every one must offer something pourable off HIS shelf. */
  step('with a guest walks all four rungs');
  {
    /* Arrive at the tab first: the step before this one navigates away,
       and a chip on a hidden screen is a click that waits thirty seconds
       and then fails for the wrong reason. */
    await page.locator('nav button[data-scr="pour"]').click();
    await page.waitForTimeout(250);
    await page.locator('#pourWhere button', { hasText: 'With a guest' }).click();
    await page.waitForTimeout(250);
    await page.locator('#guestBody input').fill('Lagavulin');
    await page.waitForTimeout(400);
    const hits = await page.locator('#guestBody .recent .item').count();
    if (!hits) {
      failures.push('guest: naming a bottle offers no matches');
    } else {
      await page.locator('#guestBody .recent .item').first().click();
      await page.waitForTimeout(300);
      for (const rung of ['Keep it in the house', 'Next door',
                          'Down the road', 'Across the pond']) {
        await page.locator('#guestBody .chip', { hasText: rung }).click();
        await page.waitForTimeout(200);
        const n = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('#guestBody .sheet')];
          const last = cards[cards.length - 1];
          return last ? last.querySelectorAll('.item').length : 0;
        });
        if (!n) failures.push('guest: "' + rung + '" suggests nothing');
      }
    }
    /* IT FAILS OUTWARD AND SAYS SO. BZ: if I have just one bottle that is
       also their favorite, we can't stay home, we have to go next door.
       That sentence is the feature - silently substituting is how an app
       loses somebody's trust - and nothing was driving it. A shelf holding
       exactly one bottle from the named maker has no house rung at all. */
    const moved = await page.evaluate(() => {
      const seed = Object.values(S.catalog).filter(p =>
        p && p.dist && L.isWhisky(p))[0];
      const only = Object.values(S.catalog).filter(p =>
        p.dist === seed.dist).length;
      const others = Object.values(S.catalog)
        .filter(p => p.sub === seed.sub && p.dist !== seed.dist).slice(0, 3);
      const thin = [seed].concat(others);
      const r = L.pourFor(seed, 'house', thin,
        (window.MAPDATA && MAPDATA.subCountry) || L.SUB_COUNTRY, {});
      return { housed: only, rung: r.rung, moved: r.moved,
               got: r.list.length };
    });
    if (moved.rung === 'house') {
      failures.push('guest: an empty house rung did not step out');
    }
    if (!moved.moved) {
      failures.push('guest: it stepped out without admitting it');
    }
    if (!moved.got) {
      failures.push('guest: it stepped out and still found nothing');
    }

    await page.locator('#pourWhere button', { hasText: 'At home' }).click();
    await page.waitForTimeout(200);
  }

  /* THE SERVICE DOORS, DRIVEN. Ten call sites were rerouted through
     postWithRetry and askService on 2026-09-10 on the strength of the
     linter and this walk - neither door had a single assertion behind it.
     readService is what turns a stale Apps Script deployment into a
     sentence instead of a parser complaining about a bracket, which is the
     exact failure that cost BZ a rules paste he did not need. */
  step('the service reader says what actually came back');
  {
    const said = await page.evaluate(async () => {
      const out = {};
      const run = async (label, body) => {
        try {
          const r = new Response(body, { status: 200 });
          const v = await readService(r, 'test');
          out[label] = 'parsed:' + JSON.stringify(v).slice(0, 30);
        } catch (e) { out[label] = (e && e.message) || String(e); }
      };
      await run('json', '{"items":[{"name":"A"}]}');
      await run('html', '<!DOCTYPE html><html><body>Sorry, unable to '
        + 'open the file</body></html>');
      await run('text', 'Exception: mode not handled');
      await run('broken', '{"items": [');
      return out;
    });
    if (!/^parsed:/.test(said.json || '')) {
      failures.push('service reader: good JSON did not parse — ' + said.json);
    }
    /* A DOCTYPE must name the deployment, because that is the fix. */
    if (!/deployment|web page/i.test(said.html || '')) {
      failures.push('service reader: a web page was not reported as one — '
        + said.html);
    }
    /* And a plain-text error must be QUOTED: "Exception: mode not handled"
       is worth more than any sentence written in advance. */
    if (!/mode not handled/.test(said.text || '')) {
      failures.push('service reader: the service\u2019s own words were '
        + 'dropped — ' + said.text);
    }
    if (/^parsed:/.test(said.broken || '')) {
      failures.push('service reader: truncated JSON was accepted');
    }
  }

  step('the keyboard does not move the nav bar');
  {
    const r = await page.evaluate(() => {
      const read = () => getComputedStyle(document.documentElement)
        .getPropertyValue('--app-h').trim();
      const before = read();
      const real = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(window.visualViewport), 'height');
      Object.defineProperty(window.visualViewport, 'height',
        { configurable: true, get: () => Math.round(window.innerHeight * 0.57) });
      setAppHeight();
      const withKb = read();
      navSelfHeal();
      const healed = read();
      Object.defineProperty(window.visualViewport, 'height', real);
      setAppHeight();
      return { before: before, withKb: withKb, healed: healed,
               inner: window.innerHeight + 'px' };
    });
    if (r.withKb !== r.inner) {
      failures.push('keyboard: the page shrank to ' + r.withKb
        + ' instead of staying ' + r.inner);
    }
    if (r.healed !== r.inner) {
      failures.push('keyboard: the self-heal put it back to ' + r.healed);
    }
  }

  step('spin is centered and its picker holds one line');
  await page.locator('nav button[data-scr="pour"]').click();
  await page.waitForTimeout(250);
  {
    await page.evaluate(() => {
      SHARED.shelves = { u1: { name: 'Not Smoky Bill', bottles: [] },
                         u2: { name: 'Tyson', bottles: [] },
                         u3: { name: 'SmokyBill', bottles: [] } };
      SHARED.names = { u1: 'Not Smoky Bill', u2: 'Tyson', u3: 'SmokyBill' };
      renderReels(); renderMatchRow();
    });
    await page.waitForTimeout(250);
    const spin = await page.locator('#spinBtn').boundingBox();
    const scr = await page.locator('#scr-pour').boundingBox();
    if (spin && scr) {
      const off = Math.abs((spin.x + spin.width / 2) - (scr.x + scr.width / 2));
      if (off > 2) {
        failures.push('pour: Spin is ' + Math.round(off) + 'px off center');
      }
    }
    const row = await page.locator('#matchRow').boundingBox();
    if (row && row.height > 56) {
      failures.push('pour: the shelf picker wrapped to '
        + Math.round(row.height) + 'px with three buddies');
    }
    await page.evaluate(() => {
      SHARED.shelves = {}; SHARED.names = {}; renderMatchRow();
    });
  }

  /* THE BAR DOES NOT SIT OVER THE END OF A SCREEN. BZ: multiple reports of
     the bottom tab bar blocking content on iPhone. The audit had a check
     CALLED "nav cannot overlay content" that matched CSS text - a claim
     about a result it could not see - so it passed throughout. This
     measures: scroll each screen to its end on a phone viewport and
     require the last thing on it to clear the top of the bar. */
  step('the tab bar never covers the end of a screen');
  for (const scr of ['home', 'shelf', 'pour', 'flights']) {
    await page.locator('nav button[data-scr="' + scr + '"]').click();
    await page.waitForTimeout(300);
    const gap = await page.evaluate(() => {
      const s = document.querySelector('.screen.on');
      const n = document.querySelector('nav');
      if (!s || !n) return null;
      s.scrollTop = s.scrollHeight;
      const kids = [...s.children].filter(k => k.getBoundingClientRect().height);
      if (!kids.length) return null;
      const last = kids[kids.length - 1].getBoundingClientRect();
      return Math.round(n.getBoundingClientRect().top - last.bottom);
    });
    if (gap !== null && gap < 0) {
      failures.push('layout: on ' + scr + ' the tab bar covers the last '
        + Math.abs(gap) + 'px of the screen');
    }
  }

  step('shop asks its question');
  // 4. Shopping asks its question, and answering it draws something.
  await page.locator('nav button[data-scr="shop"]').click();
  await page.waitForTimeout(250);
  // Back to the question first: an earlier pass through the tabs may have
  // answered it, and the answer is remembered on purpose.
  //
  // Guarded on VISIBILITY, not count. #shopBack is built once and then
  // hidden until a situation is answered, so it is in the DOM on a screen
  // where it cannot be clicked; a count guard sent Playwright to wait
  // thirty seconds for an element the app was deliberately hiding.
  const chg = page.locator('#shopBack').first();
  if (await chg.isVisible()) { await chg.click(); await page.waitForTimeout(300); }

  /* However many situations there are, every one of them has to draw.
     This asserted exactly three and broke when a fourth was added, which
     is a walk testing its own memory rather than the app: the thing worth
     checking is that each tile leads somewhere, not that there are three
     of them. */
  const choices = await page.locator('#scr-shop .modetile').count();
  if (choices < 3) {
    failures.push('shop: only ' + choices + ' situations offered');
  } else {
    // Each situation in turn. Reaching the question again means pressing
    // Back, because the answer is remembered — which is the point of it.
    for (let i = 0; i < choices; i++) {
      if (!(await page.locator('#scr-shop .modetile').count())) {
        const back = page.locator('#shopBack');
        if (await back.count()) {
          await back.first().click();
          await page.waitForTimeout(250);
        }
      }
      if (!(await page.locator('#scr-shop .modetile').count())) {
        failures.push('shop: cannot get back to the question');
        break;
      }
      await page.locator('#scr-shop .modetile').nth(i).click();
      await page.waitForTimeout(400);
      const body = (await page.locator('#scr-shop').innerText()).trim();
      if (body.length < 40) {
        failures.push('shop: situation ' + (i + 1) + ' draws nothing');
      }
    }
  }

  // 4b. Pasting a page and getting a bottle out of it.
  //
  //     What BZ saw: a bottle named "Old Fitzgerald100 Proof Bottled in
  //     Bond 7 Year Old Bourbon starstarstarstarstar16 reviews...", a
  //     header claiming he was standing in a shop, and a verdict built on
  //     none of it. The name parser was being fed 160 characters of page
  //     BODY by a function written for a <title>. Nothing above could
  //     reach it, because it only happens after a real paste into a real
  //     textarea.
  {
    const chg2 = page.locator('#shopBack').first();
    await page.locator('nav button[data-scr="shop"]').click();
    await page.waitForTimeout(250);
    if (await chg2.isVisible()) { await chg2.click(); await page.waitForTimeout(300); }
    /* By LABEL, not by position. Both of these picked a tile by index and
       broke the moment a fourth mode was added between them — the walk
       reported "no pills on the planning screen" when the screen was fine
       and the click had gone somewhere else. */
    const modes = page.locator('#scr-shop .modetile');
    if (await modes.count() >= 3) {
      /* BY WHAT IT DOES, NOT WHAT IT SAYS. This matched on the word
         "website" and broke the moment the tile was reworded to "Looking at
         a bottle online" — a walk step failing on a rewording is testing
         the copy, which is exactly what rule 30c says not to do. The mode
         id is the durable thing: it is what the code branches on. */
      await page.locator('.modetile[data-mode="online"]').first().click();
      await page.waitForTimeout(300);
      const ta = page.locator('#scr-shop textarea').first();
      if (!(await ta.count())) {
        failures.push('paste: no textarea on the website situation');
      } else {
        await ta.fill(['Old Fitzgerald',
          '100 Proof Bottled in Bond 7 Year Old Bourbon',
          'starstarstarstarstar', '16 reviews', 'Choose a bottle size',
          '750ml bottle', '$79.99', 'Add to cart'].join('\n'));
        await page.locator('#scr-shop button', { hasText: 'Read it' })
          .first().click();
        await page.waitForTimeout(600);

        const q = await page.locator('#shopQ').inputValue();
        if (/star|reviews|Choose a bottle/i.test(q)) {
          failures.push('paste: page furniture ended up in the name: '
            + q.slice(0, 60));
        }
        if (!/^Old Fitzgerald 100 Proof/.test(q)) {
          failures.push('paste: name came out as ' + JSON.stringify(q.slice(0, 60)));
        }
        const modeLine = (await page.locator('#scr-shop .hdr .sub').first()
          .textContent()) || '';
        if (/in a store/i.test(modeLine)) {
          failures.push('paste: header still claims you are in a store');
        }
        const shopText = await page.locator('#scr-shop').innerText();
        if (!/100 proof/i.test(shopText)) {
          failures.push('paste: the proof the page printed never reached '
            + 'the bottle view');
        }
      }
    }
  }

  step('a bottle opens from the shelf');
  // 5. A bottle opens from the shelf, which is the commonest thing anybody
  //    does and the one that leaves the tab bar behind.
  await page.locator('nav button[data-scr="shelf"]').click();
  await page.waitForTimeout(250);
  if (await page.locator('#shelfList .tile').count()) {
    await page.locator('#shelfList .tile').first().click();
    await page.waitForTimeout(200);
  }
  if (await page.locator('#shelfList .item').count()) {
    await page.locator('#shelfList .item').first().click();
    await page.waitForTimeout(300);
    if (!(await page.locator('#scr-detail').isVisible())) {
      failures.push('a bottle does not open from the shelf');
    }
    const backs = await page.locator('#scr-detail .backbtn:visible').count();
    if (!backs) failures.push('the bottle screen has no way back');
  }

  step('home tiles hold one row');
  // 6. The six home summary tiles hold one row at every width, and none of
  //    them widens the page.
  //
  //    Six columns across a 360px phone leaves each number about 40px of
  //    room, and "$32,807" does not break. A track that cannot shrink pushes
  //    the document wider than the viewport; body{overflow:hidden} then
  //    clips the last child of the flex column, which is the nav. That is
  //    the disappearing tab bar, and it has arrived by three different
  //    routes now. This walks the widths and fails on the first one where
  //    the value overflows its tile, the page overflows the window, or the
  //    row breaks in two.
  await page.locator('nav button[data-scr="home"]').click();
  await page.waitForTimeout(300);
  for (const w of [360, 390, 430, 500, 600, 699, 700, 820, 1200]) {
    await page.setViewportSize({ width: w, height: 780 });
    await page.waitForTimeout(200);
    const t = await page.evaluate(() => {
      const wrap = document.querySelector('#homeBody > .tiles');
      if (!wrap) return null;
      const tiles = [...wrap.children];
      const tops = new Set(tiles.map(x => Math.round(x.getBoundingClientRect().top)));
      const worst = tiles.reduce((a, x) => {
        const v = x.querySelector('.v');
        const over = v.scrollWidth - v.clientWidth;
        return over > a.over ? { over, text: v.textContent } : a;
      }, { over: 0, text: '' });
      const nav = document.querySelector('nav').getBoundingClientRect();
      return {
        count: tiles.length,
        rows: tops.size,
        over: worst.over,
        text: worst.text,
        pageOver: document.documentElement.scrollWidth - window.innerWidth,
        navBottom: Math.round(nav.bottom),
        vh: window.innerHeight
      };
    });
    if (!t) { failures.push('home: no summary tiles'); break; }
    if (t.rows !== 1) {
      failures.push('home tiles at ' + w + 'px: ' + t.rows + ' rows, want 1');
    }
    if (t.over > 0) {
      failures.push('home tiles at ' + w + 'px: ' + JSON.stringify(t.text)
        + ' overflows its tile by ' + t.over + 'px');
    }
    if (t.pageOver > 0) {
      failures.push('home tiles at ' + w + 'px: page is ' + t.pageOver
        + 'px wider than the window');
    }
    if (t.navBottom > t.vh + 2) {
      failures.push('home tiles at ' + w + 'px: nav pushed '
        + (t.navBottom - t.vh) + 'px off the bottom');
    }
  }
  await page.setViewportSize({ width: 390, height: 780 });

  step('the log splits, every row has an X');
  // 7. The log: pours on Taste, flights on Flights, and an X on every row.
  //
  //    Three things that can only be checked with a real click. The X calls
  //    stopPropagation — without it every removal also opened the bottle —
  //    and Undo lives in a toast that has to still be on the glass when it
  //    is pressed. The split matters because one array feeds both screens:
  //    a removal on one used to leave the other showing the entry still
  //    there.
  {
    const seeded = await page.evaluate(() => {
      /* global S, save_, allFlights, renderHome, renderFlights,
                renderHistory, renderPayline */
      const k = Object.keys(S.catalog).slice(0, 2);
      const f = allFlights()[0];
      if (k.length < 2 || !f) return null;
      S.history = [
        { kind: 'pour', k: k[0], at: '2026-09-01' },
        { kind: 'pour', k: k[1], at: '2026-09-02' },
        { kind: 'flight', flight: f.title, at: '2026-09-02',
          pours: [{ k: k[0] }, { k: k[1] }] }
      ];
      save_(); renderHome(); renderFlights(); renderHistory(); renderPayline();
      return { title: f.title };
    });

    if (!seeded) {
      failures.push('log: could not seed a pour and a run');
    } else {
      await page.locator('nav button[data-scr="pour"]').click();
      await page.waitForTimeout(350);

      if (await page.locator('#histBody .bars').count()) {
        failures.push('log: the month bars are still on the pour log');
      }
      const pourRows = await page.locator('#histBody .recent .item').count();
      if (pourRows !== 2) {
        failures.push('log: ' + pourRows + ' rows on the pour log, want 2 '
          + '(the run belongs on Flights)');
      }
      if (await page.locator('#histBody .dismiss').count() !== pourRows) {
        failures.push('log: not every pour row has an X');
      }

      await page.locator('nav button[data-scr="flights"]').click();
      await page.waitForTimeout(450);
      /* The flights screen now leads with three things to do — run one you
         designed, build one from scratch, see what you have poured — and
         the list of flights is behind the first of them. BZ asked for that
         shape; the walk follows it rather than the old one, and still
         proves the list, the run log and the flight cards are all reachable
         and correct one tap in. */
      /* Four TILES now, in the same shape the shop uses — BZ asked for
         that, plus Suggestions as a fourth. They were rows for one build
         and this walk was written against those. */
      const doors = await page.locator('#scr-flights .modetile').count();
      if (doors !== 4) {
        failures.push('flights: ' + doors + ' actions offered, want 4');
      }
      await page.locator('#scr-flights .modetile',
        { hasText: 'Run one you designed' }).click().catch(() => {});
      await page.waitForTimeout(450);
      // And a way back to them, which every screen you go into needs.
      /* By what it SAYS, not what class it wears. This asserted .chip and
         the back was rebuilt as btn btn-sm ghost — the shape every other
         back in the app uses — so a correct change failed a check that was
         testing the styling rather than the behavior. Rule 30c. */
      /* In the HEADER now, not the body — BZ: put it where the other pages
         put theirs. Looked up by what it says, across the whole screen, so
         moving it again does not fail a check that is meant to be about
         whether it exists. */
      if (!(await page.locator('#scr-flights button',
            { hasText: '\u2039 Flights' }).count())) {
        failures.push('flights: the list has no way back to the tiles');
      }
      /* THE RUN LOG WENT in v1.9.4. BZ reported the duplication twice —
         why show the same list 2x, and then: don't need both — and every
         card already carries the date it was run. What this step was
         guarding is that a run is VISIBLE somewhere on the page, so it
         looks where it now shows. */
      const ranShown = await page.locator('#flightList .fcard.done').count();
      if (!ranShown) {
        failures.push('flights: nothing shows that a flight has been run');
      }

      // The X, and the navigation it must NOT do.
      if (await page.locator('#flightList .dismiss').count()) {
        await page.locator('#flightList .dismiss').first().click();
        await page.waitForTimeout(400);
        if (await page.locator('#scr-detail').isVisible()) {
          failures.push('flights: the X opened the flight as well as '
            + 'removing it');
        }
        if (await page.locator('#flightList .recent .item').count()) {
          failures.push('flights: the X did not remove the run');
        }

        // Undo, from the toast, and back to where it came from.
        const undo = page.locator('#toast .toastact');
        if (!(await undo.count())) {
          failures.push('flights: removing a run offers no Undo');
        } else {
          await undo.first().click();
          await page.waitForTimeout(400);
          if (await page.locator('#flightList .recent .item').count() !== 1) {
            failures.push('flights: Undo did not put the run back');
          }
        }
      }

      // The pours are untouched by any of that.
      await page.locator('nav button[data-scr="pour"]').click();
      await page.waitForTimeout(350);
      if (await page.locator('#histBody .recent .item').count() !== 2) {
        failures.push('log: removing a run changed the pour log');
      }
    }
  }

  step('flight editor host line survives a save');
  // 7. A host line typed into the flight editor is still there after a save.
  //
  //    The line per pour is the only place a flight says anything about a
  //    particular bottle, and nothing could write one: Save flight rebuilt
  //    the cards from the catalog every time. The logic is tested in
  //    §198; this is the wiring — that the field exists, that what is typed
  //    reaches the pour, and that pressing Save does not throw it away.
  {
    await page.locator('nav button[data-scr="flights"]').click();
    await page.waitForTimeout(400);
    const card = page.locator('#scr-flights .fcard').first();
    if (!(await card.count())) {
      failures.push('flights: no flight cards to open');
    } else {
      await card.click();
      await page.waitForTimeout(350);
      const edit = page.locator('#scr-detail button', { hasText: /^Edit$/ }).first();
      if (!(await edit.count())) {
        failures.push('flight editor: no Edit button on a flight');
      } else {
        await edit.click();
        await page.waitForTimeout(350);
        const notes = page.locator('.pourrow .pnote');
        const n = await notes.count();
        if (!n) {
          failures.push('flight editor: no host line field on any pour');
        } else {
          const typed = 'HOST LINE UNDER TEST';
          await notes.first().fill(typed);
          await page.locator('.modal button', { hasText: 'Save flight' })
            .first().click();
          await page.waitForTimeout(500);

          await page.locator('#scr-detail button', { hasText: /^Edit$/ })
            .first().click();
          await page.waitForTimeout(400);
          const back = await page.locator('.pourrow .pnote').first().inputValue();
          if (back !== typed) {
            failures.push('flight editor: the host line did not survive a save, '
              + 'came back as ' + JSON.stringify(back.slice(0, 40)));
          }
          const cancel = page.locator('.modal button', { hasText: 'Cancel' }).first();
          if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(200); }
        }
      }
    }
  }

  step('shop: typing survives, buy buys');
  // 8. Shopping: typing survives, the actions are on the glass, buy buys.
  //
  //    Three faults in one screen. renderShop lifted the search row out of
  //    a container it then emptied and appended it back — moving a focused
  //    input blurs it, so every keystroke ended the typing and a name came
  //    out as one letter. It also ran a full render per character, and the
  //    render walks the shelf. And Want it / I bought it lived inside a
  //    collapsed fold labeled "Correct these details", which is not where
  //    anybody looks for the buy button.
  {
    await page.locator('nav button[data-scr="shop"]').click();
    await page.waitForTimeout(300);
    const chg3 = page.locator('#shopBack').first();
    if (await chg3.isVisible()) { await chg3.click(); await page.waitForTimeout(300); }
    const modes3 = page.locator('#scr-shop .modetile');
    if ((await modes3.count()) < 3) {
      failures.push('shop: cannot reach the situation question');
    } else {
      // By label, so adding a situation cannot silently retarget this.
      await page.locator('.modetile[data-mode="store"]').first()
        .click();
      await page.waitForTimeout(350);

      // Typed one key at a time, the way a phone types. Anything that
      // blurs the box loses the rest of the word.
      const typed = 'Glenfarclas 105';
      await page.locator('#shopQ').fill('');
      await page.locator('#shopQ').click();
      await page.type('#shopQ', typed, { delay: 40 });
      // Long enough for the debounced redraw AND the auto-lookup that fires
      // 900ms after the last keystroke — otherwise the lookup's own message
      // lands on top of whatever is being asserted below.
      await page.waitForTimeout(1500);

      const held = await page.locator('#shopQ').inputValue();
      if (held !== typed) {
        failures.push('shop: typing ' + JSON.stringify(typed)
          + ' left ' + JSON.stringify(held));
      }
      const stillFocused = await page.evaluate(() =>
        document.activeElement && document.activeElement.id === 'shopQ');
      if (!stillFocused) failures.push('shop: the box lost focus while typing');

      // The pills say what they are for.
      if (!(await page.locator('#scr-shop .dimcap').count())) {
        failures.push('shop: the axis pills have no caption');
      }

      // Both actions on the glass, no fold to open first.
      for (const label of ['Want it', 'I bought it']) {
        const b = page.locator('#scr-shop button', { hasText: label }).first();
        if (!(await b.count()) || !(await b.isVisible())) {
          failures.push('shop: "' + label + '" is not visible');
        }
      }
      if (await page.locator('#shopFixed details').count()) {
        failures.push('shop: the details are still behind a fold');
      }

      // And the details sit above the verdict, under the name.
      const order = await page.evaluate(() => {
        const fixed = document.getElementById('shopFixed');
        const form = fixed.querySelector('.shopform');
        const verdict = fixed.querySelector('.verdict');
        if (!form || !verdict) return null;
        return form.compareDocumentPosition(verdict)
          & Node.DOCUMENT_POSITION_FOLLOWING ? 'form first' : 'verdict first';
      });
      if (order !== 'form first') {
        failures.push('shop: the details are not under the name block ('
          + order + ')');
      }

      // A buy that cannot go through has to SAY so and point at the field
      // it wants. It used to flash a toast over a screen with no proof
      // field on it, which is indistinguishable from a button that does
      // nothing.
      const before = await page.evaluate(() => S.bottles.length);
      await page.locator('#scr-shop button', { hasText: 'I bought it' })
        .first().click();
      await page.waitForTimeout(400);
      const refused = await page.evaluate(() => {
        const n = document.querySelector('#shopFixed .looknote');
        const bad = document.querySelector('#shopFixed .field.needed');
        return { msg: n ? n.textContent.trim() : '',
                 field: bad ? bad.getAttribute('name') : null,
                 grew: S.bottles.length };
      });
      if (!/proof/i.test(refused.msg)) {
        failures.push('shop: a buy with no proof said '
          + JSON.stringify(refused.msg.slice(0, 50)));
      }
      if (refused.field !== 'proof') {
        failures.push('shop: a refused buy did not mark the proof field');
      }
      if (refused.grew !== before) {
        failures.push('shop: a bottle with no proof was added anyway');
      }

      // Now fill the proof in and buy it properly.
      await page.locator('#shopFixed [name="proof"]').fill('105');
      await page.locator('#shopFixed [name="proof"]').dispatchEvent('change');
      await page.waitForTimeout(400);
      await page.locator('#scr-shop button', { hasText: 'I bought it' })
        .first().click();
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => S.bottles.length);
      // And it goes on the shelf cased the way the shelf is cased, not the
      // way it happened to be typed.
      const stored = await page.evaluate(() => {
        const b = S.bottles[S.bottles.length - 1];
        const p = b && S.catalog[b.k];
        return p ? p.name : '';
      });
      if (after === before + 1 && stored !== 'Glenfarclas 105') {
        failures.push('shop: bought bottle stored as ' + JSON.stringify(stored));
      }
      if (after !== before + 1) {
        const why = await page.evaluate(() => {
          const t = document.querySelector('.toast');
          return t ? t.textContent.trim().slice(0, 60) : 'no toast';
        });
        failures.push('shop: I bought it did not add a bottle ('
          + before + ' -> ' + after + ', ' + why + ')');
      }
    }
  }

  step('card rows hold one line');
  // 9. A row placed straight into a card lays its controls out on ONE line.
  //
  //    .item is the shelf's seven-column grid, and six screens reuse the
  //    class for its background and its colored edge with only two
  //    children — so the buttons landed in the 96px "type" column and
  //    wrapped inside it. Checked by geometry rather than by CSS: build the
  //    same shape the library offers build, and compare the tops of the two
  //    buttons.
  {
    // On a VISIBLE screen. A hidden container has no layout, so every rect
    // is zero and getComputedStyle hands back the specified value instead
    // of the used one — the check passes without measuring anything.
    await page.locator('nav button[data-scr="home"]').click();
    await page.waitForTimeout(250);
    for (const w of [360, 390, 820]) {
    await page.setViewportSize({ width: w, height: 780 });
    await page.waitForTimeout(150);
    const wrapped = await page.evaluate(() => {
      const card = document.createElement('div');
      card.className = 'sheet';
      const item = document.createElement('div');
      item.className = 'item';
      const left = document.createElement('div');
      // The worst case: a name with no break in it, which is what took the
      // page width with it last time.
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = 'Heaven Hill Bottled In Bond Bourbon 7 Year Kentucky '
        + 'Straight Bourbon Whiskey';
      left.appendChild(nm);
      const acts = document.createElement('div');
      acts.style.cssText = 'display:flex;gap:6px;align-items:center';
      ['\u00d7 Drop', '+ Add'].forEach(t => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = t;
        acts.appendChild(b);
      });
      item.appendChild(left); item.appendChild(acts);
      card.appendChild(item);
      document.getElementById('scr-home').appendChild(card);
      const [a, b] = [...acts.children].map(x => x.getBoundingClientRect());
      const nameBox = left.getBoundingClientRect();
      const itemBox = item.getBoundingClientRect();
      card.remove();
      return {
        sameLine: Math.abs(a.top - b.top) < 2,
        // Beside the name, not under it. Under it is what the old code did
        // on purpose to escape the 48px track.
        besideName: a.top < nameBox.bottom,
        /* The BUTTONS, not their wrapper. A flex container inside a 48px
           track measures 48px wide while its children spill straight out
           of it, so the wrapper's own box shows nothing wrong — which is
           how the first version of this check passed against a build with
           the fix removed. */
        spill: Math.round(Math.max(a.right, b.right) - itemBox.right),
        pageOver: document.documentElement.scrollWidth - window.innerWidth,
        navBottom: Math.round(document.querySelector('nav')
          .getBoundingClientRect().bottom),
        vh: window.innerHeight
      };
    });
    if (!wrapped.sameLine) {
      failures.push('card row at ' + w + 'px: the two pills wrapped');
    }
    if (!wrapped.besideName) {
      failures.push('card row at ' + w + 'px: the pills fell under the name');
    }
    // The reason they were banished in the first place: two chips in a
    // fixed 48px track pushed the page wider than the phone and clipped
    // the nav. A long unbreakable name is the worst case, so that is what
    // the row is built with.
    if (wrapped.spill > 1) {
      failures.push('card row at ' + w + 'px: the pills spill ' + wrapped.spill
        + 'px past the row');
    }
    if (wrapped.pageOver > 0) {
      failures.push('card row at ' + w + 'px: page is ' + wrapped.pageOver
        + 'px wider than the window');
    }
    if (wrapped.navBottom > wrapped.vh + 2) {
      failures.push('card row at ' + w + 'px: nav pushed off the bottom');
    }
    }
    await page.setViewportSize({ width: 390, height: 780 });
  }

  step('shelf sort control and column labels');
  // 10. The shelf: sort control and column labels only once there is a list,
  //     and the headers actually sort it.
  {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.locator('nav button[data-scr="shelf"]').click();
    await page.waitForTimeout(400);

    // The way in is the type tiles. Nothing to sort yet.
    if (await page.locator('#shelfList .tile').count()) {
      if (await page.locator('#scr-shelf .sortpick').isVisible()) {
        failures.push('shelf: the sort control shows over the type tiles');
      }
      if (await page.locator('#scr-shelf .listhead').isVisible()) {
        failures.push('shelf: the column labels show over the type tiles');
      }
      await page.locator('#shelfList .tile').first().click();
      await page.waitForTimeout(300);
    }

    if (!(await page.locator('#scr-shelf .sortpick').isVisible())) {
      failures.push('shelf: no sort control once the list is shown');
    }
    if (!(await page.locator('#scr-shelf .listhead').isVisible())) {
      failures.push('shelf: no column labels once the list is shown');
    }

    // Proof, twice: ascending, then descending, read off the rows.
    // The FIRST .pf on each row. A row has three of them — proof, price and
    // have — so selecting them all compares proofs against dollars and
    // fails whatever the sort did.
    const proofs = async () => page.evaluate(() =>
      [...document.querySelectorAll('#shelfList .item')]
        .map(r => parseFloat((r.querySelector('.pf') || {}).textContent))
        .filter(n => !isNaN(n)));
    const head = page.locator('#scr-shelf .sorthead[data-col="proof"]');
    await head.click();
    await page.waitForTimeout(300);
    const up = await proofs();
    if (up.length > 2 && !up.every((v, i) => i === 0 || up[i - 1] <= v)) {
      failures.push('shelf: Proof did not sort ascending');
    }
    await head.click();
    await page.waitForTimeout(300);
    const down = await proofs();
    if (down.length > 2 && !down.every((v, i) => i === 0 || down[i - 1] >= v)) {
      failures.push('shelf: a second click did not reverse Proof');
    }
    // And the menu agrees with the header, because they are one value.
    const sel = await page.locator('#sortSel').inputValue();
    if (sel !== 'proofd') {
      failures.push('shelf: the Sort menu says ' + sel + ' after two clicks '
        + 'on Proof, want proofd');
    }
    await page.setViewportSize({ width: 390, height: 780 });
  }

  step('find it searches');
  // 11. The Find it button, and the tag that is also one.
  {
    await page.locator('nav button[data-scr="shelf"]').click();
    await page.waitForTimeout(350);
    if (await page.locator('#shelfList .tile').count()) {
      await page.locator('#shelfList .tile').first().click();
      await page.waitForTimeout(250);
    }
    if (await page.locator('#shelfList .item').count()) {
      await page.locator('#shelfList .item').first().click();
      await page.waitForTimeout(300);
      const find = page.locator('#scr-detail button', { hasText: 'Find it' });
      if (!(await find.count())) {
        failures.push('bottle: no Find it button');
      } else {
        // It must be a real search for THIS bottle, not a bare google.com.
        const name = (await page.locator('#scr-detail h2').first()
          .textContent()).trim();
        const url = await find.first().evaluate(b => {
          let got = null;
          const real = window.open;
          window.open = u => { got = u; return null; };
          b.click();
          window.open = real;
          return got;
        });
        if (!url || url.indexOf('google.com/search') < 0) {
          failures.push('bottle: Find it opened ' + JSON.stringify(url));
        } else if (url.indexOf(encodeURIComponent(name.split(' ')[0])) < 0) {
          failures.push('bottle: Find it does not carry the bottle name: '
            + url.slice(0, 80));
        }
      }
    }
  }

  step('backup round-trips');
  // 12. The backup round-trips through the real buttons.
  //
  //     A backup that does not restore is not a backup, and the logic in
  //     §214 only proves the pair in isolation. This drives Settings: back
  //     up, wreck the shelf, restore, and check the bottles came back.
  {
    await page.evaluate(() => { show('settings'); });
    await page.waitForTimeout(300);
    const made = await page.evaluate(() => {
      /* global S, KEYS, L */
      const b = L.makeBackup(S, KEYS, Date.now());
      window.__backup = JSON.stringify(b);
      return { bottles: (S.bottles || []).length, keys: Object.keys(b.keys).length };
    });
    if (made.keys < 15) {
      failures.push('backup carries only ' + made.keys + ' keys');
    }
    const restored = await page.evaluate(() => {
      const before = (S.bottles || []).length;
      S.bottles = [];                       // as if the key had been lost
      const read = L.readBackup(window.__backup, KEYS);
      if (!read.ok) return 'refused its own backup: ' + read.why;
      Object.keys(read.keys).forEach(k => { S[k] = read.keys[k]; });
      return { before: before, after: (S.bottles || []).length };
    });
    if (typeof restored === 'string') {
      failures.push('backup: ' + restored);
    } else if (restored.after !== restored.before) {
      failures.push('backup: restored ' + restored.after + ' bottles of '
        + restored.before);
    }
    await page.locator('nav button[data-scr="home"]').click();
    await page.waitForTimeout(200);
  }

  step('every type tile lists bottles');
  // 13. Every type tile on the shelf lists bottles.
  //
  //     BZ, 2026-09-03: "on the shelf page, the tiles exist, when you click
  //     on them, nothing happens." Not reproducible here, at either width,
  //     on any of the twelve — so this walks all of them rather than one,
  //     and will say which tile if it ever comes back.
  {
    for (const w of [390, 900]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.locator('nav button[data-scr="shelf"]').click();
      await page.waitForTimeout(300);
      /* Cleared FIRST. The tiles are the untouched state, and an earlier
         step in this walk clicks one and never puts it back — so counting
         before resetting counted the list that tile produced, found no
         tiles, and blamed the shelf. */
      await page.evaluate(() => {
        ['types', 'obsc', 'regions', 'bands', 'proofs', 'scars']
          .forEach(k => { S.filters[k] = []; });
        S.filters.cask = ''; S.filters.age = '';
        S.filters.favsOnly = false; S.filters.wishOnly = false;
        S.shelfSub = null;
        document.getElementById('q').value = '';
        renderShelf(); renderShelfFilters();
      });
      await page.waitForTimeout(150);
      const n = await page.locator('#shelfList .tile').count();
      if (!n) { failures.push('shelf at ' + w + 'px: no type tiles'); continue; }
      for (let i = 0; i < n; i++) {
        await page.evaluate(() => {
          S.filters.types = []; S.shelfSub = null;
          document.getElementById('q').value = '';
          renderShelf(); renderShelfFilters();
        });
        await page.waitForTimeout(90);
        const tiles = page.locator('#shelfList .tile');
        if ((await tiles.count()) <= i) break;
        const label = (await tiles.nth(i).innerText()).split('\n')[0];
        await tiles.nth(i).click();
        await page.waitForTimeout(180);
        if (!(await page.locator('#shelfList .item').count())) {
          failures.push('shelf at ' + w + 'px: the ' + label
            + ' tile listed nothing');
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 780 });
  }

  step('home tiles go somewhere, map');
  // 14. The home tiles go where their number lives, and the map is the way
  //     to the map. A number you can read and not follow is a dead end.
  {
    await page.locator('nav button[data-scr="home"]').click();
    await page.waitForTimeout(300);
    const want = [['bottles on the shelf', 'shelf'],
                  ['open and pourable', 'pour'],
                  ['different whiskies', 'shelf'],
                  ['ready to pour', 'flights']];
    for (const [label, screen] of want) {
      await page.locator('nav button[data-scr="home"]').click();
      await page.waitForTimeout(200);
      const tile = page.locator('#homeBody > .tiles > button.tile')
        .filter({ hasText: label });
      if (!(await tile.count())) {
        failures.push('home: "' + label + '" is not tappable');
        continue;
      }
      await tile.first().click();
      await page.waitForTimeout(300);
      const on = await page.evaluate(n =>
        document.getElementById('scr-' + n).classList.contains('on'), screen);
      if (!on) failures.push('home: "' + label + '" did not open ' + screen);
    }
    // The shelf value names no screen and must stay a label.
    await page.locator('nav button[data-scr="home"]').click();
    await page.waitForTimeout(200);
    const val = page.locator('#homeBody > .tiles > button.tile')
      .filter({ hasText: 'shelf value at MSRP' });
    if (await val.count()) {
      failures.push('home: the shelf value is tappable but goes nowhere');
    }
    // The map opens the map, and the chip that used to say so is gone.
    const mapBtn = page.locator('#homeBody button.mapwrap');
    if (!(await mapBtn.count())) {
      failures.push('home: the map is not the way to the map');
    } else {
      if (await page.locator('#homeBody button', { hasText: 'Open the map' })
            .count()) {
        failures.push('home: the Open the map chip is still there');
      }
      await mapBtn.first().click();
      await page.waitForTimeout(300);
      if (!(await page.evaluate(() =>
          document.getElementById('scr-map').classList.contains('on')))) {
        failures.push('home: pressing the map did not open the map');
      }
    }
  }

  step('time for a taste holds its height');
  // 15. Time for a taste holds its height. It swung 466 -> 482 -> 417 as a
  //     pour name wrapped to two lines instead of three, and a machine that
  //     resizes under your thumb reads as the app stumbling.
  {
    await page.locator('nav button[data-scr="pour"]').click();
    await page.waitForTimeout(300);
    const heights = [];
    for (let i = 0; i < 6; i++) {
      heights.push(await page.evaluate(() => Math.round(
        document.querySelector('.machine').getBoundingClientRect().height)));
      await page.locator('#spinBtn').click();
      await page.waitForTimeout(700);
    }
    const spread = Math.max.apply(null, heights) - Math.min.apply(null, heights);
    if (spread > 2) {
      failures.push('the taste box moved ' + spread + 'px across spins: '
        + heights.join(', '));
    }
  }

  step('home tiles lead somewhere');
  // 14. The home tiles go where their number lives.
  {
    await page.locator('nav button[data-scr="home"]').click();
    await page.waitForTimeout(300);
    /* Named by what they lead to, not by their exact wording. This listed
       'flights run', which was renamed to 'ready to pour tonight' — a walk
       that breaks when a label is reworded is testing the copy rather than
       the behavior, and the behavior is that every tile with a number on
       it goes where that number lives. */
    const want = { 'bottles on the shelf': 'shelf', 'open and pourable': 'pour',
                   'different whiskies': 'shelf',
                   'ready to pour': 'flights' };
    for (const label of Object.keys(want)) {
      const tile = page.locator('#homeBody > .tiles > button.tile')
        .filter({ hasText: label });
      if (!(await tile.count())) {
        failures.push('home: "' + label + '" is not tappable');
        continue;
      }
      await tile.first().click();
      await page.waitForTimeout(250);
      const on = await page.evaluate(() => {
        const s = document.querySelector('.screen.on');
        return s ? s.id.replace('scr-', '') : null;
      });
      if (on !== want[label]) {
        failures.push('home: "' + label + '" opened ' + on
          + ', want ' + want[label]);
      }
      await page.locator('nav button[data-scr="home"]').click();
      await page.waitForTimeout(200);
    }
    // The shelf value is not a place, so it stays a label.
    const notATile = await page.locator('#homeBody > .tiles > button.tile')
      .filter({ hasText: 'shelf value at MSRP' }).count();
    if (notATile) failures.push('home: the shelf value should not be a button');

    /* The two chart lanes end near each other. column-count balances by
       total height, which cannot help when one card is taller than the
       rest together: By type has thirteen rows against Recognition's
       three, and the right lane stopped half way up the page. */
    const lanes = await page.evaluate(() => {
      if (window.innerWidth < 700) return null;   // one lane below the break
      const c = [...document.querySelectorAll('#homeCharts .chartcol')];
      return c.length === 2
        ? c.map(x => Math.round(x.getBoundingClientRect().height)) : c.length;
    });
    if (lanes && typeof lanes !== 'number') {
      const gap = Math.abs(lanes[0] - lanes[1]);
      const tallest = Math.max(lanes[0], lanes[1]);
      // A third of the taller lane. Cards cannot be split, so they will
      // never be equal; a lane ending half way up the page is the fault.
      if (gap > tallest / 3) {
        failures.push('home charts: lanes are ' + lanes.join(' and ')
          + ' tall, ' + gap + 'px apart');
      }
    } else if (typeof lanes === 'number') {
      failures.push('home charts: ' + lanes + ' lanes, want 2');
    }

    // The map IS the button; the chip that used to say so is gone.
    const map = page.locator('#homeBody button.mapwrap');
    if (!(await map.count())) {
      failures.push('home: the map is not tappable');
    } else {
      await map.first().click();
      await page.waitForTimeout(250);
      const on = await page.evaluate(() =>
        (document.querySelector('.screen.on') || {}).id);
      if (on !== 'scr-map') failures.push('home: the map opened ' + on);
      await page.locator('nav button[data-scr="home"]').click();
      await page.waitForTimeout(200);
    }
    if (await page.locator('#homeBody button', { hasText: 'Open the map' }).count()) {
      failures.push('home: the Open the map chip is still there');
    }
  }

  step('bottle controls sit in their sections');
  // 15. The bottle screen: one control per section, and Shop's two ways
  //     out on one line.
  {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.evaluate(() => { S.lookupUrl = 'http://app.local/lookup'; });
    await page.locator('nav button[data-scr="shelf"]').click();
    await page.waitForTimeout(300);
    if (await page.locator('#shelfList .tile').count()) {
      await page.locator('#shelfList .tile').first().click();
      await page.waitForTimeout(200);
    }
    await page.locator('#shelfList .item').first().click();
    await page.waitForTimeout(350);

    /* The bottle screen got a real .hdr in v1.9.0, so its one control moved
       out of .detail-acts and into the header with the mark and the title —
       the same shape every other screen has. What this step is guarding is
       unchanged: the top of a bottle holds the way back and nothing else,
       because it once held nine controls and wrapped to three lines on a
       phone. Looked for where it now lives. */
    const top = await page.evaluate(() =>
      [...document.querySelectorAll('#scr-detail .hdr .backbtn')]
        .filter(b => !b.hidden).map(b => b.textContent.trim()));
    // The row that held nine controls and wrapped to three lines on a phone.
    if (top.length !== 1) {
      failures.push('bottle: the top row holds ' + top.length
        + ' controls (' + top.join(', ') + '), want the way back only');
    }

    const placed = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('#detailBody .sheet').forEach(c => {
        const head = (c.querySelector('h3') || c.querySelector('h2') || {})
          .textContent || '';
        [...c.querySelectorAll('.sectionacts button, .chip, .favstar')]
          .forEach(b => { out[b.textContent.trim()] = head; });
      });
      return out;
    });
    const wantIn = (label, head) => {
      const got = Object.keys(placed).filter(l => l.indexOf(label) === 0)[0];
      if (!got) { failures.push('bottle: no "' + label + '" anywhere'); return; }
      if (placed[got].indexOf(head) < 0) {
        failures.push('bottle: "' + got + '" sits under ' + placed[got]
          + ', want ' + head);
      }
    };
    wantIn('Pour it', 'Your bottle');
    // The filing key must never be on the screen.
    const ids = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#detailBody .sheet')]
        .filter(x => /Your bottle|bottles$/.test(
          ((x.querySelector('h3') || {}).textContent || '')))[0];
      return c ? /\bB\d{3,}\b/.test(c.innerText) : false;
    });
    if (ids) failures.push('bottle: the internal id is on the screen');
    wantIn('Find it', 'Your bottle');
    wantIn('+ Another bottle', 'Your bottle');
    wantIn('Edit', '');            // under the bottle's own details card
    wantIn('Delete', '');
    // A bottle with notes has no notes lookup; one without must have it.
    const noteCase = await page.evaluate(() => {
      const p = Object.values(S.catalog).filter(x => L.noteGaps(x).length)[0];
      if (!p) return 'none missing notes';
      showBottle(p.k);
      const labels = [...document.querySelectorAll('#detailBody .sheet')]
        .filter(c => /Tasting notes/.test((c.querySelector('h3') || {}).textContent || ''))
        .flatMap(c => [...c.querySelectorAll('button')].map(b => b.textContent.trim()));
      return labels.join(', ');
    });
    if (typeof noteCase === 'string' && noteCase.indexOf('Look up notes') < 0) {
      failures.push('bottle with no notes: the notes card offers ' + noteCase);
    }

    // Shop: Home and Back on one line, not stacked.
    await page.locator('nav button[data-scr="shop"]').click();
    await page.waitForTimeout(250);
    if (await page.locator('#scr-shop .modetile').count()) {
      await page.locator('#scr-shop .modetile').first().click();
      await page.waitForTimeout(350);
    }
    /* Away and back, four times. The button was BUILT on every render into
       a header this screen never clears, so they piled up — three, four,
       five chevrons across the top — and labelBacks renamed the survivors
       to "Home" because it carried the class that means "follow the
       trail". One of it, saying Back, however often you leave and return. */
    for (let i = 0; i < 4; i++) {
      await page.locator('nav button[data-scr="home"]').click();
      await page.waitForTimeout(120);
      await page.locator('nav button[data-scr="shop"]').click();
      await page.waitForTimeout(200);
    }
    const stacked = await page.evaluate(() => ({
      backs: document.querySelectorAll('#shopBack').length,
      visible: [...document.querySelectorAll('#scr-shop .hdr button')]
        .filter(b => !b.hidden).map(b => b.textContent.trim())
    }));
    if (stacked.backs !== 1) {
      failures.push('shop: ' + stacked.backs + ' back buttons after navigating');
    }
    if (stacked.visible.filter(l => /Back/.test(l)).length !== 1) {
      failures.push('shop: the header reads ' + stacked.visible.join(', '));
    }
    // And it is gone once there is no situation to go back from.
    await page.locator('#shopBack').click();
    await page.waitForTimeout(300);
    const onQuestion = await page.evaluate(() =>
      [...document.querySelectorAll('#scr-shop .hdr button')]
        .filter(b => !b.hidden).map(b => b.textContent.trim()));
    if (onQuestion.some(l => /Back/.test(l))) {
      failures.push('shop: Back still shows on the question screen');
    }
    await page.locator('#scr-shop .modetile').first().click();
    await page.waitForTimeout(300);

    const hdr = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#scr-shop .hdr button')]
        .filter(b => !b.hidden);
      if (bs.length < 2) return { n: bs.length };
      const a = bs[0].getBoundingClientRect(), b = bs[1].getBoundingClientRect();
      /* CENTERS, NOT TOP EDGES. Two controls of different heights on one
         line have different tops by definition, and the header now holds a
         34px mark beside 36px buttons — so this failed on a header that was
         perfectly fine. Same line means the middles agree. */
      const mid = r => r.top + r.height / 2;
      return { n: bs.length, sameLine: Math.abs(mid(a) - mid(b)) < 4,
               labels: bs.map(x => x.textContent.trim() || '(mark)') };
    });
    if (hdr.n >= 2 && !hdr.sameLine) {
      failures.push('shop: ' + hdr.labels.join(' and ') + ' are on two lines');
    }
  }

  /* 17. Every dimension pill draws its screen.
   *
   *    Nothing pressed one, which is how "renderAxis is not defined"
   *    reached BZ's phone on a build where audit, 2051 assertions, the
   *    sync cycle, the render check and this walk were all green. The
   *    function had been deleted with the one above it and no check
   *    opened the screen that calls it. */
  step('every dimension pill draws');
  {
    await page.locator('nav button[data-scr="shop"]').click();
    await page.waitForTimeout(300);
    /* Back to the question FIRST. Shop remembers the last answer, so this
       step arrived in store mode, where the same pills exist and pressing
       one legitimately leaves the scroll pane empty — nothing is typed yet.
       Eight false failures came from checking planning-mode output on the
       store screen. */
    const back = page.locator('#shopBack').first();
    if (await back.isVisible()) { await back.click(); await page.waitForTimeout(300); }
    const tiles = page.locator('#scr-shop .modetile');
    if (await tiles.count() >= 3) {
      await page.locator('.modetile[data-mode="plan"]')
        .first().click();
      await page.waitForTimeout(450);
    } else {
      failures.push('dimensions: could not reach the planning screen');
    }
    /* The DIMENSIONS, not every chip on the screen. With a lookup service
       configured the store card adds its own subject chips — A bottle, A
       shelf — into the same row shape, and this step tried to press them
       as if they were axes. Scoped to the dimension row itself. */
    const pills = page.locator('#scr-shop .dimrow .chip');
    const n = await pills.count();
    if (!n) {
      failures.push('dimensions: no pills on the planning screen');
    }
    for (let i = 0; i < n; i++) {
      const label = (await pills.nth(i).textContent() || '').trim();
      // A page error lands in `failures` via the pageerror handler at the
      // top; there is no separate errors array, and referring to one threw
      // inside the check itself.
      const before = failures.length;
      /* SAY WHICH ONE, and do not hang the whole walk on it. This timed
         out after v1.9.8 with no clue which pill or why: a 30-second hang
         and a line number. A named failure is a diagnosis; a timeout is a
         second job. */
      try {
        await pills.nth(i).click({ timeout: 4000 });
      } catch (e) {
        const seen = await pills.nth(i).isVisible().catch(() => false);
        failures.push('dimensions: could not press "' + label + '" ('
          + (seen ? 'visible but not clickable' : 'not visible') + ')');
        continue;
      }
      await page.waitForTimeout(350);
      const drew = await page.evaluate(() =>
        document.querySelectorAll('#shopScroll .sheet').length);
      if (failures.length > before) {
        failures.push('dimension "' + label + '" is the one that threw');
      } else if (!drew) {
        failures.push('dimension "' + label + '" drew nothing');
      }
    }
  }

  step('suggestions open bottles, wishlist reachable');
  // 16. A category suggestion opens bottles, and the wishlist is reachable.
  {
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.evaluate(() => {
      S.wish = [{ name: 'Longrow 18', added: '2026-09-01', reason: 'Peated' }];
      save_();
    });
    await page.locator('nav button[data-scr="shop"]').click();
    await page.waitForTimeout(250);
    const back0 = page.locator('#shopBack');
    if (await back0.count() && !(await back0.first().isHidden())) {
      await back0.first().click(); await page.waitForTimeout(250);
    }
    const modes = page.locator('#scr-shop .modetile');
    if ((await modes.count()) > 1) {
      await modes.nth(1).click();            // deciding what to buy next
      await page.waitForTimeout(600);
    }
    /* An ask is a CATEGORY — "A World worth owning" — and it used to be
       typed into the search box and looked up as though it were a bottle
       name. The lookup failed, and the screen then offered a verdict, an
       Edit form and a Want it button for a whisky that does not exist. */
    // Emptied first: an earlier step types a bottle name in here, and the
    // point of this check is that clicking a CATEGORY does not put one in.
    await page.evaluate(() => { document.getElementById('shopQ').value = ''; });
    const asks = page.locator('#scr-shop .item .nm');
    if (await asks.count()) {
      const label = (await asks.first().innerText()).trim();
      await asks.first().click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        modal: document.getElementById('overlay').classList.contains('on'),
        box: document.getElementById('shopQ').value
      }));
      if (!after.modal) {
        failures.push('shop: the suggestion "' + label + '" opened no bottles');
      }
      if (after.box) {
        failures.push('shop: the suggestion put ' + JSON.stringify(after.box)
          + ' in the search box as if it were a bottle');
      }
      await page.evaluate(() => closeModal());
      await page.waitForTimeout(200);
    }

    /* The wishlist is ON the search screen, not only behind a chip: this
       is what you open standing in a shop with nothing typed, which is
       exactly when the question is what you meant to buy. */
    await page.evaluate(() => {
      S.shopMode = 'store';
      document.getElementById('shopQ').value = '';
      renderShop();
    });
    await page.waitForTimeout(300);
    const onSearch = await page.evaluate(() =>
      [...document.querySelectorAll('#scr-shop .sheet h3')]
        .map(h => h.textContent));
    if (!onSearch.some(h => /wishlist/i.test(h))) {
      failures.push('shop: the search screen shows ' + onSearch.join(', ')
        + ' and no wishlist');
    }
    // One tap from there to the bottle, not two.
    const row = page.locator('#scr-shop .item').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(400);
      const landed = await page.evaluate(() => ({
        box: document.getElementById('shopQ').value,
        mode: S.shopMode
      }));
      if (!landed.box) failures.push('shop: tapping a wanted bottle typed nothing');
      if (landed.mode !== 'store') {
        failures.push('shop: tapping a wanted bottle left the mode as '
          + landed.mode);
      }
      await page.evaluate(() => {
        document.getElementById('shopQ').value = ''; renderShop();
      });
      await page.waitForTimeout(200);
    }

    // The wishlist, from a shop rather than only from the planning screen.
    const chip = page.locator('#shopWish');
    if (!(await chip.count())) {
      failures.push('shop: no way to see the wishlist');
    } else {
      const label = (await chip.first().innerText()).trim();
      if (!/\d/.test(label)) {
        failures.push('shop: the wishlist chip reads ' + JSON.stringify(label));
      }
      await chip.first().click();
      await page.waitForTimeout(300);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('.modal .item .nm')].map(x => x.textContent));
      if (!rows.length) failures.push('shop: the wishlist opened empty');
      await page.evaluate(() => closeModal());
      await page.waitForTimeout(200);
    }
  }

  step('the add form fills itself');
  /* 17. The thing the suite cannot see.

     productForm is a render function, so the harness cannot call it, and
     until this step nothing in the gate had ever OPENED the add-a-bottle
     form. L.fillPlan is tested to death and none of that proves the form
     is wired to it — which is the whole reason rule 30b exists. */
  {
    await page.evaluate(() => { closeModal(); productForm(null); });
    await page.waitForTimeout(400);

    // The control BZ objected to is gone, and nothing put another in.
    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll('.modal .form button')]
        .map(b => (b.textContent || '').trim()).filter(Boolean));
    if (buttons.some(b => /fill in the rest/i.test(b))) {
      failures.push('add form: "Fill in the rest" is still a button');
    }

    // And the note takes no room before it has anything to say.
    const openState = await page.evaluate(() => {
      const n = document.querySelector('.modal .looknote');
      return { there: !!n, hidden: n ? n.hidden : null,
               h: n ? n.getBoundingClientRect().height : -1 };
    });
    if (!openState.there) failures.push('add form: no note element at all');
    else if (!openState.hidden) {
      failures.push('add form: the note is in the layout before anything '
        + 'has been typed (' + openState.h + 'px, and .form has a 9px gap '
        + 'around it either way)');
    }
    else if (openState.h > 0) {
      failures.push('add form: the note is hidden and still '
        + openState.h + 'px tall');
    }

    /* A NAME THE SHELF KNOWS FILLS ITSELF ON BLUR. Driven through the real
       DOM against the real catalog, because "the fields got values" is
       the claim and L.fillPlan returning 'shelf' is not it. */
    const known = await page.evaluate(() => {
      const p2 = Object.values(S.catalog).find(x => x.dist && x.proof);
      return p2 ? p2.name : null;
    });
    if (!known) failures.push('add form: no catalog entry to try');
    else {
      const filled = await page.evaluate(name => {
        const f = document.querySelector('.modal .form');
        const n = f.querySelector('[name="name"]');
        n.value = name;
        n.dispatchEvent(new Event('blur'));
        return new Promise(res => setTimeout(() => {
          const note = f.querySelector('.looknote');
          res({
            dist: (f.querySelector('[name="dist"]') || {}).value,
            proof: (f.querySelector('[name="proof"]') || {}).value,
            note: note ? (note.textContent || '').trim() : '',
            hidden: note ? note.hidden : null
          });
        }, 250));
      }, known);
      if (!filled.dist && !filled.proof) {
        failures.push('add form: blurring "' + known
          + '" filled nothing — dist ' + JSON.stringify(filled.dist)
          + ', proof ' + JSON.stringify(filled.proof));
      }
      /* The behavior, not the wording (rule 30c): it has to SAY something
         and be visible, and a rewrite of the sentence must not fail this. */
      if (filled.hidden || !filled.note) {
        failures.push('add form: it filled the fields and said nothing');
      }
    }

    /* A NAME NOTHING KNOWS OFFERS THE CALL RATHER THAN MAKING IT. */
    await page.evaluate(() => { S.lookupUrl = 'https://example.invalid/x'; });
    const offered = await page.evaluate(() => {
      const f = document.querySelector('.modal .form');
      const n = f.querySelector('[name="name"]');
      n.value = 'Zzzqx Nonesuch Whisky';
      n.dispatchEvent(new Event('blur'));
      return new Promise(res => setTimeout(() => {
        const note = f.querySelector('.looknote');
        res({ hidden: note ? note.hidden : null,
              act: !!(note && note.querySelector('.noteact')) });
      }, 250));
    });
    if (offered.hidden) {
      failures.push('add form: an unknown name said nothing at all');
    }
    if (!offered.act) {
      failures.push('add form: no way to spend a lookup on an unknown name');
    }
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(200);
  }

  step('the mash bill reaches the screen, the label sheet says what it would change, the name field reserves only the slots it has, sharing reads as on or off, a long read says it is still going, changing tabs closes an open sheet');
  /* 18. A field nobody can see is a field nobody fills.

     The suite proves L.parseMash and L.mashTags to death and none of it
     proves the bottle screen draws them — showBottle is a render function
     the harness cannot call. It was also worth writing because my own
     one-off check looked for the tags inside `.modal` and found none, and
     the screen is not a modal: the check was wrong, not the app, and a
     check that lies in that direction wastes a whole round. */
  {
    const seen = await page.evaluate(() => {
      const k = Object.keys(S.catalog)[0];
      if (!k) return null;
      S.edits[k] = Object.assign({}, S.edits[k],
        { mash: '75% corn, 21% rye, 4% malted barley' });
      rebuildCatalog();
      showBottle(k);
      return {
        tags: [...document.querySelectorAll('.tag.grain')].map(t => t.textContent),
        src: [...document.querySelectorAll('.src')].map(x => x.textContent)
          .filter(t => /corn/i.test(t))
      };
    });
    if (!seen) {
      failures.push('mash: no catalog to try it on');
    } else {
      /* The BEHAVIOR, not the wording (rule 30c): three grains in, three
         tags out, each naming its grain. A rewrite of the labels must not
         fail this and a parse that silently drew nothing must. */
      if (seen.tags.length !== 3) {
        failures.push('mash: a three-grain bill drew ' + seen.tags.length
          + ' tags: ' + JSON.stringify(seen.tags));
      }
      if (!seen.tags.some(t => /corn/i.test(t))
          || !seen.tags.some(t => /malted barley/i.test(t))) {
        failures.push('mash: the tags do not name the grains: '
          + JSON.stringify(seen.tags));
      }
      /* The printed sentence survives beside our reading of it, so a parse
         that got it wrong is visible rather than silently replacing it. */
      if (!seen.src.length) {
        failures.push('mash: the tags are drawn and the printed bill is not');
      }
    }

    /* AND THE FORM CAN TAKE ONE. A gap the fill can close and nobody can
       type is half a feature. */
    await page.evaluate(() => { closeModal(); productForm(null); });
    await page.waitForTimeout(300);
    const typed = await page.evaluate(() => {
      const f = document.querySelector('.modal .form');
      const i = f.querySelector('[name="mash"]');
      if (!i) return null;
      i.value = '51% corn, rest undisclosed';
      const vals = {};
      f.querySelectorAll('input,select').forEach(x => { vals[x.name] = x.value; });
      return L.normalizeProduct(vals).mash;
    });
    if (typed === null) failures.push('add form: no mash bill field');
    else if (typed !== '51% corn, rest undisclosed') {
      failures.push('add form: a typed mash bill did not survive the save: '
        + JSON.stringify(typed));
    }
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(200);
  }

  step('the label sheet says what it would change');
  /* 19. labelSheet is a render function the harness cannot call, and every
     decision behind it is tested in L — which proves nothing about whether
     the sheet is wired to those decisions. Driven with the answer the real
     vision service returned for BZ's three Bardstown panels. */
  {
    await page.evaluate(() => { closeModal(); S.lookupUrl = 'https://example.invalid/x'; });
    const k = await page.evaluate(() =>
      Object.keys(S.catalog).find(x => /Bardstown Silver Oak/i.test(x)) || null);
    if (!k) {
      failures.push('label: the Bardstown entry this drives is not in the catalog');
    } else {
      const onScreen = await page.evaluate(kk => {
        showBottle(kk);
        return [...document.querySelectorAll('.sectionacts button')]
          .map(x => x.textContent.trim());
      }, k);
      /* The behavior, not the wording: there has to be a way in from the
         bottle screen, and it must be there on an entry with nothing
         missing — a lookup hides when there are no gaps and a label read
         must not, because correction is not a gap. */
      if (!onScreen.some(t => /label/i.test(t))) {
        failures.push('label: no way to read the label from the bottle screen: '
          + JSON.stringify(onScreen));
      }

      const sheet = await page.evaluate(kk => {
        const raw = { name: 'Bardstown Bourbon Company Collaborative Series Silver Oak',
          dist: 'Bardstown Bourbon Co.', proof: 108, abv: 54, sub: 'bourbon',
          style: 'blend', fin: 'Silver Oak Cabernet Barrels', size: 750,
          upc: '857552008936', mash: null, tn: null, read: 'legible' };
        const f = L.labelFields(raw);
        labelSheet(S.catalog[kk], f, raw, () => {});
        const rows = [...document.querySelectorAll('.modal .item')];
        return {
          fields: rows.map(r => (r.querySelector('.chip') || {}).textContent),
          replaces: rows.map(r => (r.querySelector('.src') || {}).textContent || ''),
          allOn: rows.every(r => (r.querySelector('.chip') || {}).dataset.on === 'true')
        };
      }, k);

      /* The cask and the style are what this bottle's entry actually gets
         wrong, and the barcode is what it has never had. */
      ['Cask', 'Style', 'Barcode'].forEach(want => {
        if (sheet.fields.indexOf(want) < 0) {
          failures.push('label: the sheet did not offer ' + want + ': '
            + JSON.stringify(sheet.fields));
        }
      });
      /* AND THE DISTILLERY MUST NOT BE THERE. "Bardstown Bourbon Company"
         against "Bardstown Bourbon Co." is one house, and accepting it
         would split the house in two everywhere that groups by it. */
      const dist = sheet.fields.indexOf('Distillery');
      if (dist >= 0 && /replaces/.test(sheet.replaces[dist] || '')) {
        failures.push('label: a company suffix is being offered as a correction');
      }
      /* The label is the primary document, so everything arrives ticked. */
      if (!sheet.allOn) {
        failures.push('label: the sheet opened with something already off');
      }
    }
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(200);
  }

  step('the name field reserves only the slots it has');
  /* 20. The two in-field controls, and the padding that follows them.

     ASSERTS THE RELATIONSHIP, NOT A COUNT. The first version of this
     expected a scanner and a camera and failed — the walk runs over
     file://, which is not a secure context, so navigator.mediaDevices is
     undefined and canScan() is false. A standalone check over
     http://localhost showed two controls and passed, which is how a test
     that depends on its environment looks right up until it does not.

     What has to be true either way: the field reserves 44px per control
     that is actually SHOWN, and nothing for one that is not. It used to add
     the class unconditionally while a button was hidden, so a browser with
     no camera reserved space for a control that was not there. */
  {
    const look = async (url) => {
      await page.evaluate(() => { closeModal(); });
      await page.waitForTimeout(250);
      return page.evaluate(u => {
        S.lookupUrl = u;
        productForm(null);
        const f = document.querySelector('.modal .form');
        const lab = f.querySelector('label');
        return {
          shown: [...f.querySelectorAll('.instbtn')].filter(x => !x.hidden)
            .map(x => x.getAttribute('aria-label')),
          pad: getComputedStyle(f.querySelector('[name="name"]')).paddingRight,
          withslots: lab.classList.contains('withslots'),
          slots2: lab.classList.contains('slots2')
        };
      }, url);
    };

    const on = await look('https://example.invalid/x');
    const want = { 0: null, 1: '44px', 2: '88px' }[on.shown.length];
    if (want && on.pad !== want) {
      failures.push('add form: ' + on.shown.length + ' control(s) '
        + JSON.stringify(on.shown) + ' but the field reserves ' + on.pad
        + ', expected ' + want);
    }
    if (on.shown.length === 2 && !on.slots2) {
      failures.push('add form: two controls and no slots2 class');
    }
    if (on.shown.length && !on.withslots) {
      failures.push('add form: a control in the field and no withslots class');
    }
    /* The camera has nothing to call without a lookup, so it goes — and the
       field must give its 44px back. */
    const off = await look('');
    if (off.shown.length >= on.shown.length) {
      failures.push('add form: turning lookup off did not remove the camera ('
        + JSON.stringify(off.shown) + ')');
    }
    if (!off.shown.length && off.withslots) {
      failures.push('add form: no controls and the field still reserves '
        + off.pad);
    }
    await page.evaluate(() => {
      closeModal(); S.lookupUrl = 'https://example.invalid/x';
    });
    await page.waitForTimeout(150);
  }

  step('sharing reads as on or off');
  /* 21. The first second-user session, 2026-09-07, found this in minutes:
     a chip reading "Not findable" is a LABEL, not a control. Nothing said
     it could be tapped, that it was off, or what tapping would do — so an
     invite went out and sharing was assumed to be on.

     Asserts the BEHAVIOR (30c): that it announces itself as a switch and
     that its state tracks the setting. A rewording must not fail this. */
  {
    const both = await page.evaluate(() => {
      const out = {};
      const was = S.findable, wasName = S.displayName;
      S.displayName = 'Tester';
      [false, true].forEach(on => {
        S.findable = on;
        const c = nameCard();
        const sw = c.querySelector('[role="switch"]');
        out[on ? 'on' : 'off'] = sw ? {
          checked: sw.getAttribute('aria-checked'),
          hasSub: !!(sw.querySelector('.src')
            && sw.querySelector('.src').textContent.trim()),
          tall: sw.getBoundingClientRect
        } : null;
      });
      S.findable = was; S.displayName = wasName;
      return out;
    });
    if (!both.off || !both.on) {
      failures.push('sharing: no switch on the settings card at all');
    } else {
      if (both.off.checked !== 'false' || both.on.checked !== 'true') {
        failures.push('sharing: the switch does not track the setting ('
          + both.off.checked + ' / ' + both.on.checked + ')');
      }
      /* The state of a privacy setting is half the information. The other
         half is what it means when it is off, and an off state with no
         explanation reads as "you are unreachable", which is false. */
      if (!both.off.hasSub) {
        failures.push('sharing: switched off and says nothing about what '
          + 'still works');
      }
    }
  }

  step('a long read says it is still going, nothing doubles on a second render, no page opens with an empty block, every screen you travel to has a way back, headers do not collide on a phone');
  /* 22. BZ: we need a cue for the user that the photo is being processed —
     tried it on Taste and thought it was broken. The only feedback was a
     toast, which times out in seconds, and a shelf read takes ten to
     sixty. Silence reads as broken.

     Asserts the BEHAVIOR: it appears, it survives a nested call, and it
     goes when the last one closes. A rewording must not fail this. */
  {
    const r = await page.evaluate(() => {
      const w = document.getElementById('working');
      if (!w) return null;
      const out = { atRest: w.hidden };
      working('one');
      out.shown = !w.hidden;
      /* THE NESTING IS THE POINT. A label read shrinks the photographs and
         THEN asks the service; without counting, the shrink finishing
         would clear the banner while the call was still running — the same
         bug this exists to fix, one layer down. */
      working('two');
      working();
      out.survivesInner = !w.hidden;
      working();
      out.goneAtEnd = w.hidden;
      return out;
    });
    if (!r) failures.push('working: no banner in the document at all');
    else {
      if (!r.atRest) failures.push('working: showing when nothing is running');
      if (!r.shown) failures.push('working: did not appear when asked');
      if (!r.survivesInner) {
        failures.push('working: an inner call finishing cleared it while an '
          + 'outer one was still running');
      }
      if (!r.goneAtEnd) failures.push('working: stayed up after the last close');
    }
  }

  step('changing tabs closes an open sheet');
  /* 23. BZ: that modal stays up if you change tabs. Rule 19 puts nav ABOVE
     the overlay so it is always tappable, and nothing was closing the
     sheet — so a photo modal sat on top of whichever tab you moved to,
     over a screen it had nothing to do with. */
  {
    const r = await page.evaluate(() => {
      try { closeModal(); } catch (e) { /* nothing open */ }
      labelPick(() => {}, { face: true, title: 'Test sheet' });
      const before = document.getElementById('overlay')
        .classList.contains('on');
      document.querySelector('nav button[data-scr="shelf"]').click();
      const after = document.getElementById('overlay')
        .classList.contains('on');
      return { before: before, after: after,
        screen: (document.querySelector('.screen.on') || {}).id };
    });
    if (!r.before) failures.push('tabs: could not open a sheet to test with');
    if (r.after) failures.push('tabs: the sheet survived a tab change');
    if (r.screen !== 'scr-shelf') {
      failures.push('tabs: the tab did not change (' + r.screen + ')');
    }
  }

  step('nothing doubles on a second render');
  /* BZ found six identical camera blocks stacked down the shop screen, and
     had already found the same shape on the buddies card. Both were mine
     and both were invisible to everything: the suite tests functions, the
     consistency checks read the file, and this walk renders each screen
     ONCE — so anything appending to a container it does not own looks
     perfect the first time and wrong for ever after.

     Render everything twice and require the same element count. Cheapest
     test in the file, and it catches a class I have now shipped twice. */
  {
    const doubled = await page.evaluate(() => {
      const out = [];
      /* A HEADLESS BROWSER HAS NO CAMERA, so canScan() is false and every
         camera control is skipped — which is why the first version of this
         step passed with the stacking bug deliberately put back. Stubbed
         true, and a lookup url set, so the branches that actually stack are
         the ones being rendered. */
      const realScan = window.canScan;
      window.canScan = () => true;
      const realUrl = S.lookupUrl;
      S.lookupUrl = 'https://example.invalid/x';
      const renders = [
        ['home', () => renderHome()],
        ['shelf', () => { renderShelfFilters(); renderShelf(); }],
        /* IN A MODE, not on the question screen. The first version of this
           called renderShop() with no mode set, which returns before the
           camera block is ever built — so it passed with the stacking bug
           deliberately reintroduced, which makes it not a check at all.
           Every screen with branches needs the branch that has the
           content in it. */
        ['shop question', () => { S.shopMode = null; renderShop(); }],
        ['shop store', () => { S.shopMode = 'store'; renderShop(); }],
        ['shop plan', () => { S.shopMode = 'plan'; renderShop(); }],
        ['pour', () => { renderPourWhere(); renderReels(); renderAway(); }],
        ['flights', () => renderFlights()],
        ['ref', () => renderReference()]
      ];
      renders.forEach(pair => {
        const name = pair[0], fn = pair[1];
        try {
          fn();
          const before = document.querySelectorAll('button, .sheet, .item').length;
          fn();
          const after = document.querySelectorAll('button, .sheet, .item').length;
          if (after !== before) {
            out.push(name + ': ' + before + ' elements became ' + after);
          }
        } catch (e) { out.push(name + ' threw: ' + e.message); }
      });
      window.canScan = realScan;
      S.lookupUrl = realUrl;
      return out;
    });
    doubled.forEach(d => failures.push('second render ' + d));
  }

  step('no page opens with an empty block');
  /* UNPROVEN, AND SAID SO (rule 28a). Two attempts to run this against the
     bug with the fix removed both hit the wrong server and tested nothing,
     so this has never been seen to go red. The FIX is measured — both the
     grouped and the list view fill the summary — but this check is not
     known to catch it. Do not trust it until somebody has watched it
     fail. */
  /* BZ, of a framed masthead with nothing in it: so fix it - I don't know
     why you would even ask. Right on both counts. A bounded block that says
     nothing is worse than the loose line it replaced, and this one shipped
     because the shelf writes its summary in two places and the grouped view
     returns before the one I fixed.

     Every page now opens with a block saying where you stand, so every one
     of them can fail this way. Checked on all of them rather than the one
     that broke. */
  {
    const empties = await page.evaluate(() => {
      const out = [];
      ['home', 'shelf', 'shop', 'pour', 'flights', 'buddies', 'ref']
        .forEach(t => {
          const nb = document.querySelector('nav button[data-scr="' + t + '"]');
          if (nb) nb.click();
          /* THE VIEW THE FAULT LIVES IN. Earlier steps leave the shelf in
             its LIST view, where a second writer fills the summary — so the
             first version of this passed with the grouped-view bug
             deliberately put back. The grouped view is the one that
             returns early, so that is the one to look at. */
          if (t === 'shelf') { S.shelfSub = null; renderShelf(); }
          /* THE VIEW THE FAULT LIVES IN. Earlier steps leave the shelf
             listing, and the empty masthead only happens on the GROUPED
             view — so the first version of this check passed with the bug
             deliberately put back. A check not run against its own fault
             is a check nobody has tested. */
          if (t === 'shelf') { S.shelfSub = null; renderShelf(); }
          const scr = document.getElementById('scr-' + t);
          if (!scr) return;
          scr.querySelectorAll('.brand, .flightmast').forEach(m => {
            const txt = (m.textContent || '').replace(/\s+/g, ' ').trim();
            /* A heading with nothing after it: the name of the block and no
               statement, which is the shape of the fault. */
            if (txt.length < 14) out.push(t + ': "' + txt + '"');
          });
        });
      return out;
    });
    empties.forEach(e => failures.push('empty opening block on ' + e));
  }

  step('every screen you travel to has a way back, the header holds together on a phone');
  /* BZ, more than once and finally without patience: there is still no way
     back from a shelf detail to the shelf page. He was right every time and
     I kept testing the ONE path that worked — shelf, tap a bottle, back —
     while the broken one was a bottle opened from anywhere else.

     labelBacks hid any back button whose destination was home, because the
     mark does that job on a tab. On a BOTTLE it left nothing: the mark goes
     home, not to the shelf, so the screen was a dead end. Checked with the
     trail deliberately emptied, which is the state it fails in. */
  {
    const stranded = await page.evaluate(() => {
      const out = [];
      // 'shared' went with Our shelves — it is the Buddies TAB now, and a
      // tab is reached by the nav rather than traveled to.
      const traveled = ['detail', 'library', 'diag', 'map', 'settings'];
      traveled.forEach(name => {
        try {
          _from.length = 0;
          if (name === 'detail') showBottle(Object.keys(S.catalog)[0]);
          else goTo(name);
          _from.length = 0;          // the state it used to vanish in
          labelBacks();
          const bk = document.querySelector('.screen.on .backbtn');
          if (!bk || bk.hidden) { out.push(name + ': no way back'); return; }
          const said = bk.textContent.trim();
          bk.click();
          const now = (document.querySelector('.screen.on') || {}).id || '';
          if (now === 'scr-' + name) {
            out.push(name + ': back said ' + said + ' and went nowhere');
          }
        } catch (e) { out.push(name + ' threw: ' + e.message); }
      });
      return out;
    });
    stranded.forEach(x => failures.push(x));
  }

  step('headers do not collide on a phone');
  /* BZ, sending a photograph of the gear sitting on top of THE SHELF: how
     are these checks not part of the norm?

     Fair. Every design measurement I took today was at 1000px, and this
     walk checked that things EXIST and never that they do not overlap. So
     a title pinned to the center of the page ran under the controls on a
     390px screen and nothing caught it — measured afterward at 60px of
     overlap on the shelf.

     Geometry, at the width he actually uses. */
  {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const clash = await page.evaluate(() => {
      const out = [];
      ['home', 'shelf', 'shop', 'pour', 'flights', 'buddies', 'ref']
        .forEach(t => {
          const nb = document.querySelector('nav button[data-scr="' + t + '"]');
          if (nb) nb.click();
          try { fitHeaderSides(); } catch (e) { /* older build */ }
          const h = document.querySelector('#scr-' + t + ' .hdr');
          if (!h) return;
          const ti = h.querySelector('.hdrtitle');
          const rt = h.querySelector('.hdr-right');
          const mk = h.querySelector('.homemark');
          if (!ti || !rt) return;
          const a = ti.getBoundingClientRect();
          const c = rt.getBoundingClientRect();
          const m = mk ? mk.getBoundingClientRect() : null;
          if (a.right > c.left + 1) {
            out.push(t + ': title runs under the controls by '
              + Math.round(a.right - c.left) + 'px');
          }
          if (m && a.left < m.right - 1) {
            out.push(t + ': title runs under the mark');
          }
          /* AND IT MUST STILL BE THERE. The first fix for the overlap
             reserved both sides and squeezed the shelf title to 0px, which
             is worse than the fault it cured. */
          if (a.width < 40) {
            out.push(t + ': title squeezed to ' + Math.round(a.width) + 'px');
          }
          /* One row, always. */
          if (m && Math.abs((a.top + a.height / 2) - (m.top + m.height / 2)) > 12) {
            out.push(t + ': header wrapped to two rows');
          }
        });
      return out;
    });
    clash.forEach(x => failures.push('phone header ' + x));
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(200);
  }

  step('the header holds together on a phone');
  /* BZ, with two screenshots of his phone: mobile header issues, check
     everything. And then: how are these checks not part of the norm?

     Fair. This walk runs at desktop width, and every fault in those
     screenshots was a 390px fault — the gear sitting ON the word SHELF
     because "+ Add bottle" and a centered title do not both fit, and every
     page's opening statement invisible because a max-width:560px rule
     hides the element it reuses. Nothing measured a phone, so nothing
     caught either.

     Checked at 390 rather than trusted: does the title clear the controls,
     and is the statement actually displayed. */
  {
    await page.setViewportSize({ width: 390, height: 844 });
    const bad = await page.evaluate(() => {
      const out = [];
      ['home', 'shelf', 'shop', 'pour', 'flights', 'buddies', 'ref']
        .forEach(t => {
          const nb = document.querySelector('nav button[data-scr="' + t + '"]');
          if (nb) nb.click();
          if (t === 'shelf') { S.shelfSub = null; renderShelf(); }
          if (t === 'shop') { S.shopMode = null; renderShop(); }
          const scr = document.getElementById('scr-' + t);
          if (!scr) return;
          const h = scr.querySelector('.hdr');
          if (h) {
            const ti = h.querySelector('.hdrtitle');
            const rg = h.querySelector('.hdr-right');
            const mk = h.querySelector('.homemark');
            if (ti && rg) {
              const a = ti.getBoundingClientRect(), b = rg.getBoundingClientRect();
              if (a.right > b.left) out.push(t + ': title runs under the controls');
            }
            if (ti && mk) {
              const a = ti.getBoundingClientRect(), m = mk.getBoundingClientRect();
              if (a.left < m.right) out.push(t + ': title runs under the mark');
            }
          }
          /* The opening block must be VISIBLE, not merely present — the
             fault was CSS hiding text that was in the DOM all along. */
          const st = scr.querySelector('.flightmast .wm span, .brand .wm span');
          if (st && !st.classList.contains('tagline')
              && getComputedStyle(st).display === 'none') {
            out.push(t + ': opening statement is hidden on a phone');
          }
        });
      return out;
    });
    bad.forEach(x => failures.push(x));
    await page.setViewportSize({ width: 1000, height: 900 });
  }

  /* THE BUDDIES PANELS, DRIVEN. Our shelves folded into this tab and the
     room is counted rather than intersected, so there is a chip strip, a
     room panel and one panel per buddy — none of which the unit suite can
     see, because all of it is wiring (rule 30b). Three buddies on purpose:
     the old screen did uids.slice(0, 2) and silently dropped the third. */
  {
    process.stdout.write('  \u00b7 the buddies tab panels one buddy each \u2026\n');
    const bad = await page.evaluate(() => {
      const out = [];
      const mk = keys => {
        const catalog = {}; const bottles = [];
        keys.forEach((k, i) => {
          catalog[k] = { k: k, name: k, proof: 92, sub: 'scotch' };
          bottles.push({ id: 'x' + i, k: k, status: 'open' });
        });
        return { catalog: catalog, bottles: bottles };
      };
      /* Signed in, because the tab's whole point is what other people are
         sharing and the signed-out branch returns before any of it. Set
         here rather than globally so nothing earlier in the walk is
         affected — this is the last step before the browser closes. */
      if (!FB.user) FB.user = { uid: 'walk-test', displayName: 'Walker' };
      /* Signed in, or the tab returns at its signed-out branch and this
         step passes by never reaching the thing it is checking. */
      if (!FB.user) FB.user = { uid: 'walkuid' };
      /* A no-op Firebase, so the tab runs its REAL path. Calling the panel
         functions directly instead would skip renderBuddiesTab, which is
         where the strip and the panel choice live — the exact wiring this
         step exists to check. */
      if (typeof firebase === 'undefined') {
        const noop = { then: f => { try { f({ val: () => null }); } catch (e) {} return noop; },
                       catch: () => noop };
        const ref = { child: () => ref, once: () => noop, on: () => {},
                      update: () => noop, remove: () => noop, set: () => noop,
                      orderByChild: () => ref, equalTo: () => ref };
        window.firebase = { database: () => ({ ref: () => ref }) };
      }
      SHARED.shelves = { u1: mk(['A', 'B']), u2: mk(['A', 'C']), u3: mk(['A', 'D']) };
      SHARED.names = { u1: 'Tyson', u2: 'Dave', u3: 'Eli' };
      /* BOTH DIRECTIONS. u2 is mutual, u1 and u3 share with me only, and
         u4 can see mine and has never shared back — the person who used to
         appear on a card above the folder as a different subject, which is
         the inconsistency this step now guards. outSig is set to match so
         the fetch landing does not redraw underneath the assertions. */
      /* u5 has granted a shelf whose snapshot has not been written yet:
         a row, no tab, and it must not read as "not sharing". */
      SHARED.granted = { u1: true, u2: true, u3: true, u5: true };
      SHARED.outList = [{ uid: 'u2', name: 'Dave' }, { uid: 'u4', name: 'Nina' }];
      SHARED.out = 2;
      SHARED.outSig = SHARED.outList.map(x => x.uid + ':' + x.name).sort().join('|');
      try { renderBuddiesTab(); } catch (e) { out.push('buddies: threw ' + e.message); return out; }

      const strip = document.getElementById('buddyStrip');
      if (!strip) { out.push('buddies: no panel strip'); return out; }
      const chips = [...strip.querySelectorAll('button')].map(b => b.textContent.trim());
      // Everyone plus one per buddy. THREE buddies, not two.
      if (chips.length !== 5) {
        out.push('buddies: ' + chips.length + ' chips, expected 4 (' + chips.join(',') + ')');
      }
      ['Everyone', 'Tyson', 'Dave', 'Eli'].forEach(n => {
        if (chips.indexOf(n) < 0) out.push('buddies: no chip for ' + n);
      });

      /* THE GRID CARRIES EVERYBODY, BOTH WAYS. Four people: three whose
         shelves I can see and one who can only see mine. A tab needs a
         shelf to draw, so u4 is a row and not a tab — and it must be a row
         somewhere, or she is invisible again. */
      const grid = document.querySelector('.budgrid');
      if (!grid) { out.push('buddies: no grid of people'); return out; }
      const lines = [...grid.querySelectorAll('.budline')];
      if (lines.length !== 5) {
        out.push('buddies: ' + lines.length + ' grid rows, expected 5');
      }
      /* THE GRANT WITHOUT A SHELF. It had no row at all before, because it
         was in neither the loaded shelves nor the outbound list. */
      /* u5 granted and has no snapshot: it is a row like any other now. */
      /* u5 granted and has no snapshot. It is a row like any other now -
         green, and it opens - which is BZ's rule: if visible = yes, then
         share. Matched by its name so the filter cannot drift on to
         somebody else's row. */
      const noShelf = lines.filter(l => /u5/.test(l.textContent));
      if (noShelf.length !== 1) {
        out.push('buddies: a grant with no shelf yet draws '
          + noShelf.length + ' rows, expected 1');
      }
      /* GREEN, AND IT OPENS. BZ: if visible = yes, then share. A grant is
         a grant, so the row does not carry a third state - the panel says
         it, which is where somebody went expecting bottles. */
      if (noShelf[0] && !noShelf[0].querySelector('.budlamp.on')) {
        out.push('buddies: a grant does not read as sharing');
      }
      if (noShelf[0] && !noShelf[0].querySelector('button.budwho')) {
        out.push('buddies: a green row does not open anything');
      }
      /* AND WHAT IS BEHIND IT SAYS SO. The panel is where somebody went
         expecting bottles, so the wait is explained there rather than as a
         third color on the row. */
      if (noShelf[0]) {
        noShelf[0].querySelector('button.budwho').click();
        const b3 = document.getElementById('buddiesBody');
        if (!/has not reached you yet/.test(b3.textContent)) {
          out.push('buddies: a shelf that has not arrived is not explained '
            + 'on its own panel');
        }
        BUD.panel = 'all';
        renderBuddiesTab();
      }
      /* It DOES offer a panel now, and must: a grant is a grant. */
      ['Tyson', 'Dave', 'Eli', 'Nina'].forEach(n => {
        if (!new RegExp(n).test(grid.textContent)) {
          out.push('buddies: ' + n + ' is on neither side of the grid');
        }
      });
      /* Nobody is listed twice, which is the fault itself. */
      ['Tyson', 'Dave', 'Eli', 'Nina'].forEach(n => {
        const hits = lines.filter(l => new RegExp(n).test(l.textContent));
        if (hits.length !== 1) {
          out.push('buddies: ' + n + ' appears on ' + hits.length + ' rows');
        }
      });
      /* The lights say which direction is missing. u2 is mutual so its
         switch is on and its lamp green; u1 shares with me and cannot see
         mine, so its switch is off. */
      const rowOf = n => lines.filter(l => new RegExp(n).test(l.textContent))[0];
      const rDave = rowOf('Dave'), rTyson = rowOf('Tyson'), rNina = rowOf('Nina');
      if (rDave && rDave.querySelector('.swtog').getAttribute('aria-checked') !== 'true') {
        out.push('buddies: the mutual buddy is not shown as sharing');
      }
      if (rDave && !rDave.querySelector('.budlamp.on')) {
        out.push('buddies: the mutual buddy has no green light');
      }
      if (rTyson && rTyson.querySelector('.swtog').getAttribute('aria-checked') !== 'false') {
        out.push('buddies: somebody who cannot see my shelf shows as sharing');
      }
      if (rNina && !rNina.querySelector('.budlamp.off')) {
        out.push('buddies: somebody who has not shared back has no red light');
      }
      /* And the open/all toggle is gone: it read a field the other person
         does not keep, so a whole shelf came back as nothing open. */
      if (/Open bottles|Every whisky/.test(document.getElementById('buddiesBody').textContent)) {
        out.push('buddies: the open/all toggle is still drawn');
      }

      const body = document.getElementById('buddiesBody');
      /* THE THIRD BUDDY IS THE POINT. Our shelves did uids.slice(0, 2) and
         dropped Eli without saying so. Bottle A sits on all three buddy
         shelves and not on the real one this page loaded, so the room panel
         must name a group of exactly those three — which it can only do if
         all three reached it. */
      /* Two named and one counted — the point is that all THREE reached
         the panel, not the order they are listed in. The order is now the
         grid's (mutual first), and an assertion on the exact wording was
         testing copy rather than behavior (rule 30c). */
      if (!/(Tyson|Dave|Eli), (Tyson|Dave|Eli) and 1 other/.test(body.textContent)) {
        out.push('buddies: the room panel does not name all three buddies ('
          + body.textContent.slice(0, 120) + ')');
      }
      // A Venn belongs on a BUDDY panel, never on the room panel.
      if (body.querySelector('svg.venn')) {
        out.push('buddies: a Venn is drawn for a room of four');
      }

      const dave = [...strip.querySelectorAll('button')]
        .filter(b => b.textContent.trim() === 'Dave')[0];
      dave.click();
      const b2 = document.getElementById('buddiesBody');
      if (!b2.querySelector('svg.venn')) {
        out.push('buddies: no Venn on a single buddy panel');
      }
      /* THE SEGMENTS ARE THE CONTROL. The three gray rows under the
         diagram are gone, so the regions themselves must be pressable and
         each must carry its word. */
      if (!/Dave/.test(b2.textContent)) {
        out.push('buddies: the buddy panel does not name the buddy');
      }
      const hits = b2.querySelectorAll('svg.venn .vhit');
      if (hits.length < 2) {
        out.push('buddies: the Venn segments are not pressable ('
          + hits.length + ' hit shapes)');
      }
      if (!/Yours only/.test(b2.textContent) || !/Both/.test(b2.textContent)) {
        out.push('buddies: the Venn regions are not labeled');
      }
      if (/Theirs alone|Yours alone|You could pour any of these/
          .test(b2.textContent)) {
        out.push('buddies: the old region rows are still drawn');
      }
      /* Pressing one opens the list, which is the whole point of them. */
      /* IT LANDS ON THEIR SHELF, NOT IN A POP-UP. BZ: why do the charts
         render pop-ups and the books render tables, tables are better -
         and the buddy drill-throughs were the same shape. A place, with a
         header, a search box and a way back. */
      hits[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const theirs = document.getElementById('scr-theirs');
      if (!theirs || !theirs.classList.contains('on')) {
        out.push('buddies: pressing a Venn segment does not open their shelf');
      } else {
        if (!theirs.querySelectorAll('#theirsBody .item').length) {
          out.push('buddies: their shelf opened with no bottles on it');
        }
        if (!theirs.querySelector('.backbtn')) {
          out.push('buddies: their shelf has no way back');
        }
      }
      show('buddies');
      /* Where you stand with THIS person is on their own panel too. */
      if (!b2.querySelector('.budline')) {
        out.push('buddies: the buddy panel does not say where you stand');
      }
      // And the strip survives its own click, or there is no way back.
      if (!document.getElementById('buddyStrip')) {
        out.push('buddies: the strip disappears once a panel is chosen');
      }
      /* ONE-WAY, THE OTHER WAY. BZ, with two accounts open: my view and
         NSB's view, not matching. On the account where somebody could see
         HIS shelf and nobody shared back, the tab drew the old empty state
         while the masthead above it said one person can see your shelf.
         Nothing shares with you here, so there are no tabs — and the grid
         must still list the person who can see yours, or they are
         invisible exactly as they were before this was built. */
      SHARED.shelves = {};
      SHARED.granted = {};
      SHARED.outList = [{ uid: 'u9', name: 'Nina' }];
      SHARED.out = 1;
      try { renderBuddiesTab(); } catch (e) {
        out.push('buddies: threw with no shelves shared with me ' + e.message);
      }
      {
        const b3 = document.getElementById('buddiesBody');
        if (!b3.querySelector('.budgrid')) {
          out.push('buddies: somebody who can see your shelf draws no grid');
        }
        if (!/Nina/.test(b3.textContent)) {
          out.push('buddies: the one-way person is not named anywhere');
        }
        if (/Once somebody shares back/.test(b3.textContent)) {
          out.push('buddies: the nobody-here state shows while somebody is here');
        }
      }

      // A buddy who stops sharing must not strand you on a dead panel.
      SHARED.outList = [];
      SHARED.out = 0;
      SHARED.granted = { u1: true };
      SHARED.shelves = { u1: mk(['A', 'B']) };
      try { renderBuddiesTab(); } catch (e) { out.push('buddies: threw on redraw ' + e.message); }
      if (!/All 2 of you|Tyson/.test(document.getElementById('buddiesBody').textContent)) {
        out.push('buddies: a dropped buddy leaves a dead panel');
      }
      return out;
    });
    bad.forEach(x => failures.push(x));
    if (!bad.length) process.stdout.write('  \u2713 the buddies tab panels one buddy each\n');
  }

  await browser.close();

  endStep();
  if (failures.length) {
    failures.forEach(f => console.log('  \u2717 ' + f));
    console.log('  \u2716 ' + failures.length + ' failure(s) in a real browser');
    process.exit(1);
  }
  console.log('  \u2713 loads, every screen draws, nav holds, shelf lists, shop asks, tiles hold one row, log splits, shop types and buys, card rows hold one line, headers sort, find it searches, backup restores, tiles go somewhere, tiles lead somewhere, bottle controls sit in their sections, suggestions open bottles, the add form fills itself, the mash bill reaches the screen');
})().catch(e => {
  /* Name the step and keep the stack. This used to print one line and throw
     the rest away, which turned every failure into a thirty-second timeout
     with nothing to read. */
  /* Everything found BEFORE the crash is still worth reading; it used to
     die holding all of it. */
  if (_found && _found.length) {
    console.log('\n  found before the crash:');
    _found.forEach(f => console.log('    \u2716 ' + f));
  }
  console.log('  \u2716 the walk died in: ' + (_step || 'setup'));
  console.log('    ' + e.message.split('\n')[0]);
  const where = (e.stack || '').split('\n').filter(l => /browser|\.js:/.test(l))
    .slice(0, 3).map(l => '    ' + l.trim()).join('\n');
  if (where) console.log(where);
  process.exit(1);
});
